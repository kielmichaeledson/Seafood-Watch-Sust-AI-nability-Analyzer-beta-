
import { GoogleGenAI, Type } from "@google/genai";
import { SeafoodInputItem, SeafoodResultItem, Rating, MatchCandidate } from "../types";
import { getSeafoodById, findCandidates, Candidate, getCanonicalTerms } from "./referenceDatabase";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`AI operation timed out after ${timeoutMs}ms. Using fallback.`);
      resolve(fallback);
    }, timeoutMs);
  });

  return Promise.race([
    promise.then((result) => {
      clearTimeout(timeoutId);
      return result;
    }),
    timeoutPromise,
  ]).catch((err) => {
    console.error("AI operation failed:", err);
    return fallback;
  });
}

declare var process: {
  env: {
    API_KEY: string;
  };
};

const singleItemSchema = {
  type: Type.OBJECT,
  properties: {
    uniqueId: {
      type: Type.STRING,
      description: "The official ID from provided ratings. Use 'N/A' if no good match.",
    },
    rating: {
      type: Type.STRING,
      enum: Object.values(Rating),
      description: "The suggested rating. If the item is Certified (MSC, ASC, etc.), this MUST be 'Certified'.",
    },
    reliabilityScore: {
      type: Type.NUMBER,
      description: "Confidence (0-100).",
    },
    notes: {
      type: Type.STRING,
      description: "Detailed reasoning for why this candidate was chosen, referencing specific attributes that matched. If the match is broad (e.g., Oregon matched to USA), explain that it is a broad match and reduce the reliability score accordingly.",
    },
  },
  required: ["uniqueId", "rating", "reliabilityScore", "notes"],
};

const responseSchema = {
    type: Type.ARRAY,
    items: singleItemSchema
};

const analysisSystemInstruction = `You are a strict data matching engine for Seafood Watch. Your task is to receive a list of seafood products and their corresponding official database ratings, then pick the best Rating ID for each. 

Terminology Mapping Rules:
1. Gear/Method Synonyms & Categories:
   - 'Traps/Pots' matches 'Pots', 'Creels', 'Cages'.
   - 'Gillnets' matches 'Set gillnets', 'Drift gillnets', 'Fixed nets'.
   - 'Diving' matches 'Hand harvested', 'Hand picked', 'Scuba'.
   - 'Lines' matches 'Handlines', 'Pole-and-line', 'Trolling', 'Longlines'.
   - 'Surround Nets' matches 'Purse seine', 'Beach seine'.
   - 'Marine Net Pens' matches 'Sea cages', 'Open pens'.
   - 'Ponds' matches 'Inland ponds', 'Earthen ponds', 'Raceways'.
   - 'Trawls' is a broad category that includes 'Bottom trawls', 'Midwater trawls', 'Beam trawls'.
   - 'Suripera' is a specific net method and should be matched exactly if a 'Suripera' rating exists.

2. Location & Body of Water (FAO Areas):
   - Understand and utilize FAO Major Fishing Area names and numeric codes (e.g., 'FAO 27' = 'Northeast Atlantic', 'FAO 67' = 'Northeast Pacific').
   - Map numeric codes or FAO names to the corresponding EconomicZone or SubnationalArea in the database.

Matching Priority:
1. CERTIFICATIONS TAKE ABSOLUTE PRECEDENCE: If the input (especially the 'Certification' column) contains ANY text indicating MSC (Marine Stewardship Council), ASC (Aquaculture Stewardship Council), or BAP (Best Aquaculture Practices), you MUST set the UniqueID to 'N/A' and the rating to 'Certified'. This applies even if a Seafood Watch rating seems to match.
2. Only use IDs from the provided 'ratings' list or 'N/A'. 
3. Match Species name, Country/Location, and Production Method as closely as possible. 
4. RELIABILITY SCORING: 
   - 100% only for PERFECT matches on all KDEs (Species, Country, Subnational, Method, Production Type).
   - Broad matches (e.g., Oregon input vs USA rating, or "Purse seine" input vs specific "Purse seine" rating) should have reliability reduced (e.g., 85-95%).
   - If a KDE is missing in the input but present in the rating, reduce reliability.
   - If a KDE is present in the input but broad in the rating, reduce reliability.
5. For 'notes', provide a clear rationale why this rating was chosen, referencing specific attributes that matched or why it was flagged as Certified (mention the specific certification found).
6. Return a JSON array of results in the exact same order as the input items.`;

type AnalysisResult = Pick<SeafoodResultItem, 'uniqueId' | 'matchedKDEs' | 'rating' | 'reliabilityScore' | 'notes' | 'isManual' | 'candidates'>;

// PERFORMANCE CONFIGURATION
const BATCH_SIZE = 20;
const MAX_CONCURRENT_BATCHES = 2; 
const API_DELAY_MS = 1500; 

interface MinifiedInput {
    id: number;
    spec: string;
    cntry: string;
    sub: string;
    bow: string;
    mthd: string;
    fw: string;
    cert: string;
}

interface BatchItemWithCandidates {
    index: number;
    data: MinifiedInput;
    ratings: { id: string; desc: string; rating: string }[];
}

function isRateLimitError(error: any): boolean {
    const errString = JSON.stringify(error).toUpperCase();
    return errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED') || errString.includes('RATE_LIMIT');
}

function getRowSignature(item: SeafoodInputItem): string {
    return `${item['Common name']}|${item['Source country']}|${item['Subnational area']}|${item['Production Method']}|${item['Wild or Farmed']}|${item['Certification']}`.toLowerCase();
}

async function rateBatch(items: { input: SeafoodInputItem; index: number }[]): Promise<AnalysisResult[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let retries = 5;
    let delay = 5000;

    const failedResult: AnalysisResult = {
        uniqueId: "N/A",
        matchedKDEs: "N/A",
        rating: Rating.NA,
        reliabilityScore: 0,
        notes: "An error occurred during analysis.",
    };

    const batchWithCandidates: BatchItemWithCandidates[] = await Promise.all(items.map(async (item) => {
        const candidates = await findCandidates({
            species: String(item.input['Common name'] || ''),
            country: String(item.input['Source country'] || ''),
            subnational: String(item.input['Subnational area'] || ''),
            bodyOfWater: String(item.input['Body of water'] || ''),
            method: String(item.input['Production Method'] || ''),
            farmedWild: String(item.input['Wild or Farmed'] || '')
        }, 5);

        return {
            index: item.index,
            data: {
                id: item.index,
                spec: String(item.input['Common name'] || ''),
                cntry: String(item.input['Source country'] || ''),
                sub: String(item.input['Subnational area'] || ''),
                bow: String(item.input['Body of water'] || ''),
                mthd: String(item.input['Production Method'] || ''),
                fw: String(item.input['Wild or Farmed'] || ''),
                cert: String(item.input['Certification'] || '')
            },
            ratings: candidates.map(c => ({
                id: c.record.UniqueID,
                desc: c.description,
                rating: c.record.RatingColor
            }))
        };
    }));

    while (retries > 0) {
        try {
            const prompt = `Match products to rating IDs:\n${JSON.stringify(batchWithCandidates)}`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    systemInstruction: analysisSystemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    temperature: 0.0,
                },
            });

            const results: any[] = JSON.parse(response.text.trim());
            
            return results.map((result, idx) => {
                const uniqueId = result.uniqueId || "N/A";
                let matchedKDEs = "N/A";
                let rating = (result.rating as Rating) || Rating.NA;
                
                if (uniqueId !== "N/A") {
                    const officialRecord = getSeafoodById(uniqueId);
                    if (officialRecord) {
                        matchedKDEs = officialRecord.matchedKDEs;
                        rating = officialRecord.rating;
                    }
                }

                // Reliability Threshold: If AI confidence is too low, treat as N/A
                const reliability = result.reliabilityScore || 0;
                let finalUniqueId = uniqueId;
                let finalRating = rating;
                let finalNotes = result.notes || "Analyzed by AI.";

                if (reliability < 60 && !result.isManual) {
                    finalUniqueId = "N/A";
                    finalRating = Rating.NA;
                    finalNotes = `Match confidence too low (${reliability}%) to provide a definitive rating. Original suggestion was ${uniqueId}.`;
                }

                // Attach candidates for user selection in UI
                const itemCandidates = batchWithCandidates[idx].ratings.map(r => {
                    const official = getSeafoodById(r.id);
                    return {
                        uniqueId: r.id,
                        rating: (r.rating as Rating) || Rating.NA,
                        matchedKDEs: official?.matchedKDEs || r.desc,
                        reliabilityScore: r.id === finalUniqueId ? reliability : 0, // AI's confidence for this specific one is not directly returned for all, but we can show them
                        notes: r.desc
                    };
                });

                return {
                    uniqueId: finalUniqueId,
                    matchedKDEs, 
                    rating: finalRating,
                    reliabilityScore: reliability,
                    notes: finalNotes,
                    candidates: itemCandidates
                };
            });

        } catch (error: any) {
            if (isRateLimitError(error) && --retries > 0) {
                await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 2000));
                delay *= 1.5;
                continue;
            }
            return items.map(() => failedResult);
        }
    }
    return items.map(() => failedResult);
}

export async function rateSeafoodData(
  data: SeafoodInputItem[],
  onProgress: (processed: number, total: number, status?: string) => void,
  signal?: AbortSignal
): Promise<AnalysisResult[]> {
  const total = data.length;
  
  // 1. Group unique items
  const uniqueItems: SeafoodInputItem[] = [];
  const signatureToIndices = new Map<string, number[]>();

  data.forEach((item, index) => {
      const sig = getRowSignature(item);
      if (!signatureToIndices.has(sig)) {
          signatureToIndices.set(sig, []);
          uniqueItems.push(item);
      }
      signatureToIndices.get(sig)!.push(index);
  });

  // 1b. Pre-Normalization Phase (AI-Driven)
  // This translates all unique species, country and method terms into canonical database terms once.
  onProgress(0, total, "Standardizing species and location data...");
  const uniqueSpecies = Array.from(new Set(uniqueItems.map(i => String(i['Common name'] || '').trim()).filter(Boolean)));
  const uniqueCountries = Array.from(new Set(uniqueItems.map(i => String(i['Source country'] || '').trim()).filter(Boolean)));
  const uniqueMethods = Array.from(new Set(uniqueItems.map(i => String(i['Production Method'] || '').trim()).filter(Boolean)));

  const normalizedKDEs = await preNormalizeKDEs(uniqueSpecies, uniqueCountries, uniqueMethods);

  // Apply normalization to unique items
  const normalizedUniqueItems = uniqueItems.map(item => ({
      ...item,
      'Common name': normalizedKDEs.species[String(item['Common name'] || '').trim()] || item['Common name'],
      'Source country': normalizedKDEs.countries[String(item['Source country'] || '').trim()] || item['Source country'],
      'Production Method': normalizedKDEs.methods[String(item['Production Method'] || '').trim()] || item['Production Method'],
  }));

  const uniqueTotal = uniqueItems.length;
  const uniqueResults: AnalysisResult[] = new Array(uniqueTotal);
  let totalRowsFullyProcessed = 0;
  let currentStatus = "Standardizing...";

  // Atomic-like update to progress to avoid race conditions during parallel AI batches
  const reportProgress = (newlyProcessed: number, status?: string) => {
    if (status) currentStatus = status;
    totalRowsFullyProcessed += newlyProcessed;
    // Cap at total to prevent UI overflow like "146 of 99"
    const displayProcessed = Math.min(totalRowsFullyProcessed, total);
    onProgress(displayProcessed, total, currentStatus);
  };

  // 2. Short-Circuit Phase
  const itemsRequiringAI: { input: SeafoodInputItem; index: number }[] = [];

  // Report that we've started initial checks
  onProgress(0, total, "Preparation: Cross-referencing database...");

  // Process short-circuits in batches
  const CHECK_BATCH_SIZE = 50;
  for (let i = 0; i < normalizedUniqueItems.length; i += CHECK_BATCH_SIZE) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      
      const batch = normalizedUniqueItems.slice(i, i + CHECK_BATCH_SIZE);
      let batchProcessedRows = 0;
      
      await Promise.all(batch.map(async (item, bIdx) => {
          const uIdx = i + bIdx;
          const sig = getRowSignature(uniqueItems[uIdx]);
          const rowCount = signatureToIndices.get(sig)?.length || 0;
          
          // 2a. Certifications
          const cert = String(item['Certification'] || '').toUpperCase();
          const isCertified = cert.includes('MSC') || cert.includes('ASC') || cert.includes('BAP') ||
                              cert.includes('MARINE STEWARDSHIP COUNCIL') || cert.includes('AQUACULTURE STEWARDSHIP COUNCIL') ||
                              cert.includes('BEST AQUACULTURE PRACTICES');

          if (isCertified) {
              uniqueResults[uIdx] = {
                  uniqueId: "N/A", matchedKDEs: "N/A", rating: Rating.Certified, reliabilityScore: 100,
                  notes: `Certified: ${item['Certification']}`,
              };
              batchProcessedRows += rowCount;
              return;
          }

          // 2b. Perfect matches
          const candidates = await findCandidates({
              species: String(item['Common name'] || ''),
              country: String(item['Source country'] || ''),
              subnational: String(item['Subnational area'] || ''),
              bodyOfWater: String(item['Body of water'] || ''),
              method: String(item['Production Method'] || ''),
              farmedWild: String(item['Wild or Farmed'] || '')
          }, 5, true);

          if (candidates.length > 0 && candidates[0].isPerfect) {
              const top = candidates[0];
              uniqueResults[uIdx] = {
                  uniqueId: top.record.UniqueID, matchedKDEs: top.description,
                  rating: getSeafoodById(top.record.UniqueID)?.rating || Rating.NA,
                  reliabilityScore: 100,
                  notes: `Direct match verified.`,
                  candidates: candidates.map(c => ({
                      uniqueId: c.record.UniqueID, rating: getSeafoodById(c.record.UniqueID)?.rating || Rating.NA,
                      matchedKDEs: c.description, reliabilityScore: c.isPerfect ? 100 : 0, notes: c.description
                  }))
              };
              batchProcessedRows += rowCount;
          } else {
              itemsRequiringAI.push({ input: item, index: uIdx });
          }
      }));

      reportProgress(batchProcessedRows, "Correlation: Matching against Seafood Watch...");
  }

  // 3. AI Analysis Phase
  if (itemsRequiringAI.length > 0) {
    onProgress(totalRowsFullyProcessed, total, `Inference: Analyzing ${itemsRequiringAI.length} complex items...`);
  }

  // We process AI batches in parallel but increment counter carefully
  for (let i = 0; i < itemsRequiringAI.length; i += (BATCH_SIZE * MAX_CONCURRENT_BATCHES)) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const batchPromises = [];
    for (let j = 0; j < MAX_CONCURRENT_BATCHES; j++) {
        const start = i + (j * BATCH_SIZE);
        if (start >= itemsRequiringAI.length) break;
        
        const batch = itemsRequiringAI.slice(start, start + BATCH_SIZE);
        
        const p = withTimeout(rateBatch(batch), 30000, batch.map(() => ({
            uniqueId: "N/A", matchedKDEs: "N/A", rating: Rating.NA, reliabilityScore: 0,
            notes: "Analysis Timeout: The AI took too long to respond for this row.",
        }))).then(results => {
            let newlyProcessedCount = 0;
            results.forEach((res, idx) => {
                const globalBatchIdx = start + idx;
                const originalUniqueIdx = itemsRequiringAI[globalBatchIdx].index;
                uniqueResults[originalUniqueIdx] = res;
                
                const sig = getRowSignature(uniqueItems[originalUniqueIdx]);
                newlyProcessedCount += signatureToIndices.get(sig)?.length || 0;
            });
            reportProgress(newlyProcessedCount, "Inference: Processing AI responses...");
            return results;
        });
        
        batchPromises.push(p);
    }

    await Promise.all(batchPromises);

    if (i + (BATCH_SIZE * MAX_CONCURRENT_BATCHES) < itemsRequiringAI.length) {
      await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
    }
  }

  // 4. Map back
  const finalResults: AnalysisResult[] = new Array(total);
  uniqueItems.forEach((item, uniqueIdx) => {
      const sig = getRowSignature(item);
      const res = uniqueResults[uniqueIdx];
      signatureToIndices.get(sig)?.forEach(originalIdx => {
          finalResults[originalIdx] = res;
      });
  });

  onProgress(total, total, "Analysis complete.");
  return finalResults;
}

export async function updateAnalysisForId(
  item: SeafoodInputItem,
  newId: string
): Promise<AnalysisResult> {
    const normalizedId = newId.trim().toLowerCase();
    
    // Handle "N/A" or "None" to remove match
    if (normalizedId === 'n/a' || normalizedId === 'none' || normalizedId === '') {
        return {
            uniqueId: "N/A",
            matchedKDEs: "N/A",
            rating: Rating.NA,
            reliabilityScore: 0,
            notes: "Match removed by user.",
            isManual: true,
        };
    }

    // 1. Check if it's a valid ID in the database first (authoritative)
    const officialRecord = getSeafoodById(newId);
    if (officialRecord) {
        return {
            uniqueId: newId,
            matchedKDEs: officialRecord.matchedKDEs,
            rating: officialRecord.rating,
            reliabilityScore: 100, 
            notes: "Manually verified by user.",
            isManual: true,
        };
    }

    // 2. Handle "Cert" or "Certification" keywords if not a valid database ID
    const isCertKeyword = normalizedId.startsWith('cert') || 
                         normalizedId === 'msc' || 
                         normalizedId === 'asc' || 
                         normalizedId === 'bap' ||
                         normalizedId === 'certified';

    if (isCertKeyword) {
        return {
            uniqueId: "Certification", 
            matchedKDEs: "Manual Certification Assignment",
            rating: Rating.Certified,
            reliabilityScore: 100,
            notes: "Manually assigned as Certified by user.",
            isManual: true,
        };
    }

    return {
        uniqueId: newId,
        matchedKDEs: "Unknown ID",
        rating: Rating.NA,
        reliabilityScore: 0,
        notes: "Invalid ID provided.",
    };
}

async function preNormalizeKDEs(
    species: string[],
    countries: string[],
    methods: string[]
): Promise<{ species: Record<string, string>; countries: Record<string, string>; methods: Record<string, string> }> {
    if (species.length === 0 && countries.length === 0 && methods.length === 0) {
        return { species: {}, countries: {}, methods: {} };
    }

    const canonical = getCanonicalTerms();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const schema = {
        type: Type.OBJECT,
        properties: {
            species: {
                type: Type.OBJECT,
                description: "Map of original species names to canonical Seafood Watch names.",
                additionalProperties: { type: Type.STRING }
            },
            countries: {
                type: Type.OBJECT,
                description: "Map of original country names to canonical Seafood Watch names.",
                additionalProperties: { type: Type.STRING }
            },
            methods: {
                type: Type.OBJECT,
                description: "Map of original production methods to canonical Seafood Watch names.",
                additionalProperties: { type: Type.STRING }
            }
        },
        required: ["species", "countries", "methods"]
    };

    const systemInstruction = `You are a data normalization expert for Seafood Watch. Your primary goal is to take a list of raw species names, country names, and production methods and clean/standardize them so they perfectly match the provided Canonical Seafood Watch reference lists.
    
    ### CANONICAL REFERENCE (TARGET NAMES):
    - SPECIES: ${JSON.stringify(canonical.species.slice(0, 300))} ... (and others)
    - COUNTRIES: ${JSON.stringify(canonical.countries)}
    - METHODS: ${JSON.stringify(canonical.methods)}

    ### DATA CLEANING RULES:
    1. EXPLICIT MAPPING: Use the Canonical lists above as your ONLY source for target names. If an input matches a canonical term (even partially or as a synonym), map it to that canonical term.
    2. COMMON ALIASES: 
       - Always convert 'US', 'USA', 'EEZ-USA' -> 'United States'.
       - Always convert 'VN', 'Viet Nam' -> 'Vietnam'.
       - Always convert 'CN' -> 'China'.
       - Always convert 'TH' -> 'Thailand'.
       - Always convert 'CA' -> 'Canada'.
    3. FAO AREAS:
       - If you see a number like '27', '67', '71', or 'Area 27', 'FAO 27', convert it to the full region name provided in the Countries list (e.g., 'Northeast Atlantic').
    4. SPECIES NAMES:
       - Remove marketing fluff (e.g., 'Fresh frozen', 'Premium', 'Filet'). 
       - Standardize names (e.g., 'Chilean Bass' -> 'Patagonian toothfish').
    5. METHODS:
       - Map specific gear to the broad families in the Methods list (e.g., 'Traps' -> 'Pots').
       
    If a term is already in the canonical list or is totally ambiguous, return it as-is. Return only the JSON mapping as requested.`;

    try {
        const aiPromise = (async () => {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `Normalize these terms:\nSpecies: ${JSON.stringify(species)}\nCountries: ${JSON.stringify(countries)}\nMethods: ${JSON.stringify(methods)}`,
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    temperature: 0.0
                }
            });
            return JSON.parse(response.text.trim());
        })();

        return await withTimeout(aiPromise, 15000, { species: {}, countries: {}, methods: {} });
    } catch (error) {
        console.warn("Pre-normalization failed, continuing with raw values.", error);
        return { species: {}, countries: {}, methods: {} };
    }
}

export function performStaticMapping(mappableFields: string[], fileHeaders: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerHeaders = fileHeaders.map(h => h.replace(/[\s_]/g, '').toLowerCase());
  
  const keywordMap: Record<string, string[]> = {
    'Wild or Farmed': ['productionmethod', 'wild', 'farm', 'type', 'source'],
    'Common name': ['commonname', 'species', 'commonname', 'product', 'item'],
    'Scientific name': ['scientificname', 'latin', 'scientific'],
    'Source country': ['economiczone', 'eez', 'country', 'origin'],
    'Subnational area': ['subnationalarea', 'subnational', 'state', 'province', 'area'],
    'Body of water': ['bows', 'faomajors', 'bodyofwater', 'water', 'bow'],
    'Production Method': ['methods', 'method', 'gear'],
    'Certification': ['harvestcertification', 'certification', 'label', 'ecolabel']
  };

  mappableFields.forEach(field => {
    const keywords = keywordMap[field] || [field.toLowerCase().replace(/[\s_]/g, '')];
    
    // Check for exact matches or high-confidence startsWith/includes
    let idx = lowerHeaders.findIndex(h => keywords.includes(h));
    
    if (idx === -1) {
      idx = lowerHeaders.findIndex(h => keywords.some(k => h.includes(k) || k.includes(h)));
    }
    
    mapping[field] = idx !== -1 ? fileHeaders[idx] : 'N/A';
  });
  return mapping;
}
