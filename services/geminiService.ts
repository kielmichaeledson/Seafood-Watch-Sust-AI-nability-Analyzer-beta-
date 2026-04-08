
import { GoogleGenAI, Type } from "@google/genai";
import { SeafoodInputItem, SeafoodResultItem, Rating } from "../types";
import { getSeafoodById, findCandidates, Candidate } from "./referenceDatabase";

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
      description: "Detailed reasoning for why this candidate was chosen, referencing specific attributes that matched.",
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

Matching Priority:
1. Only use IDs from the provided 'ratings' list or 'N/A'. 
2. Match Species name, Country/Location, and Production Method as closely as possible. 
3. If the input 'Certification' column contains any text indicating MSC (Marine Stewardship Council), ASC (Aquaculture Stewardship Council), or BAP (Best Aquaculture Practices), including specific certification codes (e.g., 'MSC-C-52577', 'ASC-A-12345'), you MUST set the UniqueID to 'N/A' and the rating to 'Certified'.
4. For 'notes', provide a clear rationale why this rating was chosen, referencing specific attributes that matched or why it was flagged as Certified (mention the specific code if found).
5. Return a JSON array of results in the exact same order as the input items.`;

type AnalysisResult = Pick<SeafoodResultItem, 'uniqueId' | 'matchedKDEs' | 'rating' | 'reliabilityScore' | 'notes' | 'isManual'>;

// PERFORMANCE CONFIGURATION
const BATCH_SIZE = 20;
const MAX_CONCURRENT_BATCHES = 2; 
const API_DELAY_MS = 1500; 

interface MinifiedInput {
    id: number;
    spec: string;
    cntry: string;
    sub: string;
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
        matchedKDEs: "Analysis Failed",
        rating: Rating.NA,
        reliabilityScore: 0,
        notes: "An error occurred during analysis.",
    };

    const batchWithCandidates: BatchItemWithCandidates[] = await Promise.all(items.map(async (item) => {
        const candidates = await findCandidates({
            species: String(item.input['Common name'] || ''),
            country: String(item.input['Source country'] || ''),
            subnational: String(item.input['Subnational area'] || ''),
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
            
            return results.map(result => {
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

                return {
                    uniqueId: finalUniqueId,
                    matchedKDEs, 
                    rating: finalRating,
                    reliabilityScore: reliability,
                    notes: finalNotes,
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
  onProgress: (processed: number, total: number) => void,
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

  const updateProgressSmoothly = (newTotalProcessed: number) => {
    while (totalRowsFullyProcessed < newTotalProcessed) {
      totalRowsFullyProcessed++;
      onProgress(totalRowsFullyProcessed, total);
    }
  };

  // 2. Short-Circuit Phase
  const itemsRequiringAI: { input: SeafoodInputItem; index: number }[] = [];

  // Parallelize database checks
  await Promise.all(normalizedUniqueItems.map(async (item, uIdx) => {
      const originalItem = uniqueItems[uIdx];
      
      // 2a. Check for explicit certifications first
      const cert = String(item['Certification'] || '').toUpperCase();
      if (cert.includes('MSC') || cert.includes('ASC') || cert.includes('BAP')) {
          uniqueResults[uIdx] = {
              uniqueId: "N/A",
              matchedKDEs: "N/A",
              rating: Rating.Certified,
              reliabilityScore: 100,
              notes: `Certified product detected via certification column: ${item['Certification']}`,
          };
          return;
      }

      // 2b. Check for perfect database matches
      const candidates = await findCandidates({
          species: String(item['Common name'] || ''),
          country: String(item['Source country'] || ''),
          subnational: String(item['Subnational area'] || ''),
          method: String(item['Production Method'] || ''),
          farmedWild: String(item['Wild or Farmed'] || '')
      }, 1);

      if (candidates.length > 0 && candidates[0].score >= 160) {
          const top = candidates[0];
          const type = top.record.ProductionMethod === 'A' ? 'Farmed' : 'Wild';
          uniqueResults[uIdx] = {
              uniqueId: top.record.UniqueID,
              matchedKDEs: top.description,
              rating: getSeafoodById(top.record.UniqueID)?.rating || Rating.NA,
              reliabilityScore: 100,
              notes: `Direct database match confirmed for ${top.record.CommonName} (${type}) from ${top.record.EconomicZone || top.record.SubnationalArea || 'Global'} using ${top.record.Methods}.`,
          };
      } else {
          itemsRequiringAI.push({ input: item, index: uIdx });
      }
  }));

  // Update progress after parallel checks
  let initialProcessedCount = 0;
  uniqueResults.forEach((res, uIdx) => {
    if (res) {
      const sig = getRowSignature(uniqueItems[uIdx]);
      initialProcessedCount += signatureToIndices.get(sig)?.length || 0;
    }
  });
  updateProgressSmoothly(initialProcessedCount);

  // 3. AI Analysis Phase
  for (let i = 0; i < itemsRequiringAI.length; i += (BATCH_SIZE * MAX_CONCURRENT_BATCHES)) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const batchPromises = [];
    for (let j = 0; j < MAX_CONCURRENT_BATCHES; j++) {
        const start = i + (j * BATCH_SIZE);
        if (start >= itemsRequiringAI.length) break;
        
        const batch = itemsRequiringAI.slice(start, start + BATCH_SIZE);
        
        const p = rateBatch(batch).then(results => {
            let newlyProcessedCount = 0;
            results.forEach((res, idx) => {
                const globalBatchIdx = start + idx;
                const originalUniqueIdx = itemsRequiringAI[globalBatchIdx].index;
                uniqueResults[originalUniqueIdx] = res;
                
                const sig = getRowSignature(uniqueItems[originalUniqueIdx]);
                newlyProcessedCount += signatureToIndices.get(sig)?.length || 0;
            });
            updateProgressSmoothly(totalRowsFullyProcessed + newlyProcessedCount);
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

  onProgress(total, total);
  return finalResults;
}

export async function updateAnalysisForId(
  item: SeafoodInputItem,
  newId: string
): Promise<AnalysisResult> {
    const normalizedId = newId.trim().toLowerCase();
    
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

export async function getColumnMapping(
  mappableFields: string[],
  fileHeaders: string[]
): Promise<{ mapping: Record<string, string>; isFallback: boolean }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const properties: Record<string, object> = {};
  mappableFields.forEach(field => {
    properties[field] = {
      type: Type.STRING,
      enum: [...fileHeaders, 'N/A'],
      description: `Best column for '${field}'.`
    };
  });
  
  const schema = {
    type: Type.OBJECT,
    properties: properties,
    required: mappableFields,
  };

  const systemInstruction = `You are an expert data mapping specialist. Map required seafood sourcing fields to file headers. Synonyms: 'Origin' = 'Source Country', 'Gear' = 'Production Method', 'Species' = 'Common Name', 'Cert' = 'Certification', 'Eco-label' = 'Certification'. Use 'N/A' if no match exists.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Map: ${JSON.stringify(mappableFields)} to ${JSON.stringify(fileHeaders)}`,
      config: { 
          systemInstruction,
          responseMimeType: "application/json", 
          responseSchema: schema, 
          temperature: 0 
      },
    });
    return { mapping: JSON.parse(response.text.trim()), isFallback: false };
  } catch {
    return { mapping: performStaticMapping(mappableFields, fileHeaders), isFallback: true };
  }
}

async function preNormalizeKDEs(
    species: string[],
    countries: string[],
    methods: string[]
): Promise<{ species: Record<string, string>; countries: Record<string, string>; methods: Record<string, string> }> {
    if (species.length === 0 && countries.length === 0 && methods.length === 0) {
        return { species: {}, countries: {}, methods: {} };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const schema = {
        type: Type.OBJECT,
        properties: {
            species: {
                type: Type.OBJECT,
                description: "Map of original species names to canonical Seafood Watch names (e.g., 'Sea Bass' -> 'Seabass').",
                additionalProperties: { type: Type.STRING }
            },
            countries: {
                type: Type.OBJECT,
                description: "Map of original country names to canonical Seafood Watch names (e.g., 'US' -> 'United States').",
                additionalProperties: { type: Type.STRING }
            },
            methods: {
                type: Type.OBJECT,
                description: "Map of original production methods to canonical Seafood Watch names (e.g., 'Trolls' -> 'Trolling lines').",
                additionalProperties: { type: Type.STRING }
            }
        },
        required: ["species", "countries", "methods"]
    };

    const systemInstruction = `You are a data normalization expert for the Seafood Watch database. 
    Your task is to take a list of unique species names, country names, and production methods from a spreadsheet and map them to their canonical equivalents used in the Seafood Watch database.
    
    Canonical Species Examples: 'Atlantic Salmon', 'Yellowfin Tuna', 'Greater Amberjack', 'Pacific Cod', 'Blue Swimming Crab'.
    Canonical Country Examples: 'United States', 'Vietnam', 'China', 'Thailand', 'Canada', 'Mexico', 'Worldwide'.
    Canonical Method Examples: 'Trolling lines', 'Pots', 'Set gillnets', 'Set longlines', 'Marine net pen', 'Ponds', 'Diving'.
    
    If a term is already canonical or you are unsure, map it to itself.`;

    try {
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
    } catch (error) {
        console.warn("Pre-normalization failed, continuing with raw values.", error);
        return { species: {}, countries: {}, methods: {} };
    }
}

export async function analyzeSheetLayout(
  sheetPreviews: { sheetName: string; data: (string | number)[][] }[]
): Promise<{ bestSheetName: string; bestHeaderRow: number }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const schema = {
    type: Type.OBJECT,
    properties: { 
        bestSheetName: { type: Type.STRING }, 
        bestHeaderRow: { type: Type.NUMBER } 
    },
    required: ["bestSheetName", "bestHeaderRow"],
  };

  const systemInstruction = `Expert spreadsheet analyst. Identify the main seafood sourcing sheet and the 1-based index of the header row.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze layout: ${JSON.stringify(sheetPreviews)}`,
      config: { 
          systemInstruction,
          responseMimeType: "application/json", 
          responseSchema: schema, 
          temperature: 0 
      },
    });
    return JSON.parse(response.text.trim());
  } catch (err) {
    return { bestSheetName: sheetPreviews[0]?.sheetName || '', bestHeaderRow: 1 };
  }
}

function performStaticMapping(mappableFields: string[], fileHeaders: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerHeaders = fileHeaders.map(h => h.toLowerCase());
  
  mappableFields.forEach(field => {
    const fLow = field.toLowerCase();
    const idx = lowerHeaders.findIndex(h => h.includes(fLow) || fLow.includes(h));
    mapping[field] = idx !== -1 ? fileHeaders[idx] : 'N/A';
  });
  return mapping;
}
