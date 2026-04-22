
import { GoogleGenAI, Type } from "@google/genai";
import { SeafoodInputItem, SeafoodResultItem, Rating, MatchCandidate } from "../types";
import { getSeafoodById, findCandidates, Candidate, getCanonicalTerms } from "./referenceDatabase";
import { normalizeRow, detectSchema } from "./kdePreprocessor";

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
      description: "The official UniqueID from the provided 'ratings' list. Use the ID of the candidate that best matches ALL key data elements. Use 'N/A' ONLY if the species is a complete mismatch or NO candidates are remotely relevant.",
    },
    rating: {
      type: Type.STRING,
      enum: Object.values(Rating),
      description: "The rating color of the chosen ID. If the item is Certified, this MUST be 'Certified' and uniqueId MUST be the ID of the CERT row from candidates.",
    },
    reliabilityScore: {
      type: Type.NUMBER,
      description: "Match accuracy (0-100). Use 100 ONLY for verbatim attribute matches. Proxy matches (e.g. Norway for USA, or Net Pen for Recirculating Tanks) MUST NOT exceed 75%. Mismatches in both Country AND Method must be below 50%.",
    },
    notes: {
      type: Type.STRING,
      description: "Explain WHY this ID was chosen. Reference specific geographic or method overlaps. Mention if this is a 'Proxy' match.",
    },
    evidence: {
      type: Type.STRING,
      description: "Extract a specific short snippet (1-2 sentences) from the 'candidates' description that PROVES why this is the best match.",
    },
  },
  required: ["uniqueId", "rating", "reliabilityScore", "notes", "evidence"],
};

const responseSchema = {
    type: Type.ARRAY,
    items: singleItemSchema
};

const analysisSystemInstruction = `You are a high-precision regional data matching engine for Seafood Watch. Your mission is to correlate user seafood product inputs with the provided list of candidates from the Seafood Watch database.

Geographic Hierarchies:
- Be smart about geography! If a user provides a subnational area like 'Alabama', 'Florida', or 'Texas' and there is a rating for 'United States' or 'Gulf of Mexico', that is a valid match (though not 100% perfect).
- If the database zone is 'Worldwide', it matches any country.
- If the database zone is a broad FAO area (e.g., 'Atlantic, Northwest'), it matches specific countries in that region (e.g., USA, Canada).

Species-Method Probabilities:
- Be critical of biologically implausible matches! For example, oysters are almost never trawled; they are farmed on beds or hand-gathered. If a candidate uses a method that is extremely unlikely for the species (e.g., trawling for bivalves), penalize it in your reliability score.

Evidence Snippets:
- For every match, you MUST provide an 'evidence' snippet. This is a direct quote or a specific 1-sentence derivation from the database candidate's description that confirms why the geography and method align with the user input.

Match Rationale Guidelines:
- NEVER claim a 'Direct match verified' or 'Exact match' if the country OR method is a proxy/regional substitute. 
- If using a regional proxy, state clearly: 'Proxy match based on [Species] with regional substitute.'
- If both Country AND Method are different, reliability MUST be low (<50%) and notes should reflect this as a 'Low-confidence proxy'.

Data Quality Warnings:
- 'species_generic': Species too broad (e.g. 'Shrimp'). Weight country and method as primary discriminators.
- 'production_type_unknown': No Farmed/Wild info. Do not exclude candidates on this basis.
- 'method_missing': No method info. Do not penalize for method mismatch.
- 'schema_compact': Input has limited data (2-3 KDEs). Accept species + geographic match as sufficient.
- 'country_worldwide': Match by species + method only.

CERTIFICATIONS:
- If a candidate comes from a CERT row and the input has a matching cert org, prioritize it and return Rating 'Certified'.

Return a JSON array of results in the exact same order as input.`;

type AnalysisResult = Pick<SeafoodResultItem, 'uniqueId' | 'matchedKDEs' | 'rating' | 'reliabilityScore' | 'notes' | 'evidence' | 'isManual' | 'candidates' | 'dataQualityWarnings'>;

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
    warnings: string[];
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

// Result Cache for the session
const sessionMatchCache = new Map<string, AnalysisResult>();
const termNormalizationCache = {
    species: new Map<string, string>(),
    countries: new Map<string, string>(),
    methods: new Map<string, string>()
};

/**
 * Calculates a strict reliability score based on attribute-level comparison.
 * Limits AI over-confidence by verifying specific KDE alignment.
 */
function calculateStrictReliability(input: any, record: any): number {
    let score = 0;
    const weights = { 
        species: 30, 
        country: 15, 
        subnational: 15,
        bodyOfWater: 10,
        method: 15, 
        farmedWild: 15 
    };

    // 1. Species Match
    const inputSpecies = (input.spec || '').toLowerCase();
    const dbSpecies = (record.CommonName || '').toLowerCase();
    if (dbSpecies.includes(inputSpecies) || inputSpecies.includes(dbSpecies)) {
        score += weights.species;
    } else {
        score += weights.species * 0.5;
    }

    // 2. Country Match
    const inputCountry = (input.cntry || '').toLowerCase();
    const dbCountry = (record.EconomicZone || '').toLowerCase();
    
    const countrySynonyms: Record<string, string[]> = {
        'united states': ['usa', 'us', 'united states of america'],
        'vietnam': ['viet nam', 'vn'],
        'china': ['cn'],
        'thailand': ['th'],
        'canada': ['ca']
    };

    const isMatch = (inputVal: string, targetVal: string) => {
        if (!inputVal || !targetVal) return false;
        const i = inputVal.toLowerCase();
        const t = targetVal.toLowerCase();
        if (t.includes(i) || i.includes(t)) return true;
        
        for (const [canonical, aliases] of Object.entries(countrySynonyms)) {
            const involvesCanonical = t.includes(canonical) || i.includes(canonical);
            const involvesAlias = aliases.some(a => t.includes(a) || i.includes(a));
            if (involvesCanonical && involvesAlias) return true;
        }
        return false;
    };

    if (inputCountry && isMatch(inputCountry, dbCountry)) {
        score += weights.country;
    } else if (dbCountry === 'worldwide' || !inputCountry) {
        score += weights.country * 0.5;
    } else {
        score -= 20; 
    }

    // 3. Subnational Area Match
    const inputSub = (input.sub || '').toLowerCase();
    const dbSub = (record.SubnationalArea || '').toLowerCase();
    if (inputSub && isMatch(inputSub, dbSub)) {
        score += weights.subnational;
    } else if (inputSub && !dbSub) {
        score += weights.subnational * 0.4;
    } else if (inputSub && dbSub && !isMatch(inputSub, dbSub)) {
        score -= 10;
    } else if (!inputSub) {
        score += weights.subnational;
    }

    // 4. Body of Water Match
    const inputBow = (input.bow || '').toLowerCase();
    const dbBow = (record.BodyOfWater || '').toLowerCase();
    if (inputBow && isMatch(inputBow, dbBow)) {
        score += weights.bodyOfWater;
    } else if (inputBow && !dbBow) {
        score += weights.bodyOfWater * 0.5;
    } else if (inputBow && dbBow && !isMatch(inputBow, dbBow)) {
        score -= 10;
    } else if (!inputBow) {
        score += weights.bodyOfWater;
    }

    // 5. Method Match
    const inputMethod = (input.mthd || '').toLowerCase();
    const dbMethod = (record.Methods || '').toLowerCase();
    if (!inputMethod || dbMethod.includes('all production methods')) {
        score += weights.method;
    } else if (dbMethod.includes(inputMethod) || inputMethod.includes(dbMethod)) {
        score += weights.method;
    } else {
        score -= 10;
    }

    // 6. Production Type (Farmed/Wild)
    const inputFW = (input.fw || '').toLowerCase();
    const dbFW = (record.ProductionMethod === 'A' ? 'farmed' : 'wild');
    if (inputFW) {
        if (inputFW.startsWith(dbFW[0])) {
            score += weights.farmedWild;
        } else {
            // Hard mismatch penalty for Farmed vs Wild
            score -= 30;
        }
    } else {
        score += weights.farmedWild * 0.5; // Unknown production type is a partial penalty
    }

    return Math.max(0, Math.min(100, score));
}

async function rateBatch(items: { input: any; index: number }[]): Promise<AnalysisResult[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let retries = 5;
    let delay = 5000;

    const failedResult: AnalysisResult = {
        uniqueId: "N/A",
        matchedKDEs: "N/A",
        rating: Rating.NA,
        reliabilityScore: 0,
        notes: "An error occurred during analysis.",
        dataQualityWarnings: []
    };

    // Before processing, check cache for the signature of these items
    const batchWithCandidates: BatchItemWithCandidates[] = await Promise.all(items.map(async (item) => {
        const candidates = await findCandidates({
            species: item.input.speciesCommonName,
            country: item.input.country,
            subnational: item.input.subnational,
            bodyOfWater: item.input.bodyOfWater,
            method: item.input.method,
            farmedWild: item.input.farmedWild,
            certification: item.input.certificationInline
        }, 8);

        return {
            index: item.index,
            data: {
                id: item.index,
                spec: item.input.speciesCommonName,
                cntry: item.input.country,
                sub: item.input.subnational,
                bow: item.input.bodyOfWater,
                mthd: item.input.method,
                fw: item.input.farmedWild,
                cert: item.input.certificationInline,
                warnings: item.input.dataQualityWarnings
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
                let evidence = result.evidence || "";
                let reliability = result.reliabilityScore || 0;
                
                if (uniqueId !== "N/A") {
                    const officialRecord = getSeafoodById(uniqueId);
                    if (officialRecord) {
                        matchedKDEs = officialRecord.matchedKDEs;
                        rating = officialRecord.rating;
                        
                        // Recalculate reliability based on actual attributes to prevent AI over-confidence
                        const strictScore = calculateStrictReliability(batchWithCandidates[idx].data, officialRecord.rawRecord);
                        reliability = Math.min(reliability, strictScore);
                    }
                }

                const warnings = batchWithCandidates[idx].data.warnings;
                if (warnings.length === 1) reliability = Math.min(reliability, 85);
                if (warnings.length >= 2) reliability = Math.min(reliability, 70);

                let finalUniqueId = uniqueId;
                let finalRating = rating;
                let finalNotes = result.notes || "Analyzed by AI.";

                if (reliability < 40 && !result.isManual) {
                    finalUniqueId = "N/A";
                    finalRating = Rating.NA;
                    finalNotes = `Match confidence too low (${reliability}%) for authoritative rating. Best attempt: ${uniqueId}.`;
                }

                const itemCandidates = batchWithCandidates[idx].ratings.map(r => {
                    const official = getSeafoodById(r.id);
                    return {
                        uniqueId: r.id,
                        rating: (r.rating as Rating) || Rating.NA,
                        matchedKDEs: official?.matchedKDEs || r.desc,
                        reliabilityScore: r.id === finalUniqueId ? reliability : 0,
                        notes: r.desc,
                        evidence: r.id === finalUniqueId ? evidence : ""
                    };
                });

                const analysisResult: AnalysisResult = {
                    uniqueId: finalUniqueId,
                    matchedKDEs, 
                    rating: finalRating,
                    reliabilityScore: reliability,
                    notes: finalNotes,
                    evidence,
                    candidates: itemCandidates,
                    dataQualityWarnings: warnings
                };

                // Cache it by signature
                const input = items[idx].input;
                const sig = `${input.speciesCommonName}|${input.country}|${input.subnational}|${input.method}|${input.farmedWild}|${input.certificationInline}`.toLowerCase();
                sessionMatchCache.set(sig, analysisResult);

                return analysisResult;
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
  onProgress(0, total, "Analyzing dataset structure...");
  // ...

  // detect schema once
  const firstRows = data.slice(0, 5).map(row => Object.values(row));
  const headers = Object.keys(data[0] || {});
  const schema = detectSchema(headers, firstRows);

  // 1. Pre-Normalization (AI-Driven)
  // ... (keep pre-normalization logic, but update to use normalized unique signatures)
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

  onProgress(0, total, "Standardizing species and location data...");
  const uniqueSpecies = Array.from(new Set(uniqueItems.map(i => String(i['Common name'] || '').trim()).filter(Boolean)));
  const uniqueCountries = Array.from(new Set(uniqueItems.map(i => String(i['Source country'] || '').trim()).filter(Boolean)));
  const uniqueMethods = Array.from(new Set(uniqueItems.map(i => String(i['Production Method'] || '').trim()).filter(Boolean)));

  const normalizedKDEs = await preNormalizeKDEs(uniqueSpecies, uniqueCountries, uniqueMethods);

  // 2. Preprocessing & Short-Circuit
  const uniqueResults: AnalysisResult[] = new Array(uniqueItems.length);
  const itemsRequiringAI: { input: any; index: number }[] = [];
  
  const columnMapping = performStaticMapping(
    ['Wild or Farmed', 'Common name', 'Scientific name', 'Source country', 'Subnational area', 'Body of water', 'Production Method', 'Certification', 'Product Source'],
    headers
  );

  const CORRELATION_BATCH_SIZE = 50;
  for (let i = 0; i < uniqueItems.length; i += CORRELATION_BATCH_SIZE) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      
      const batchIndices = Array.from({ length: Math.min(CORRELATION_BATCH_SIZE, uniqueItems.length - i) }, (_, k) => i + k);
      
      await Promise.all(batchIndices.map(async (uIdx) => {
          const rawItem = uniqueItems[uIdx];
          const rawSig = getRowSignature(rawItem);
          
          if (sessionMatchCache.has(rawSig)) {
              uniqueResults[uIdx] = sessionMatchCache.get(rawSig)!;
              return;
          }

          const normalizedRow = normalizeRow(rawItem, schema, columnMapping);
          
          if (normalizedRow.speciesCommonName) normalizedRow.speciesCommonName = normalizedKDEs.species[normalizedRow.speciesCommonName] || normalizedRow.speciesCommonName;
          if (normalizedRow.country) normalizedRow.country = normalizedKDEs.countries[normalizedRow.country] || normalizedRow.country;
          if (normalizedRow.method) normalizedRow.method = normalizedKDEs.methods[normalizedRow.method] || normalizedRow.method;

          const candidates = await findCandidates({
              species: normalizedRow.speciesCommonName,
              country: normalizedRow.country,
              subnational: normalizedRow.subnational,
              bodyOfWater: normalizedRow.bodyOfWater,
              method: normalizedRow.method,
              farmedWild: normalizedRow.farmedWild,
              certification: normalizedRow.certificationInline
          }, 5, true);

          if (candidates.length > 0 && candidates[0].isPerfect) {
              const top = candidates[0];
              uniqueResults[uIdx] = {
                  uniqueId: top.record.UniqueID, 
                  matchedKDEs: top.description,
                  rating: mapRecordToRating(top.record),
                  reliabilityScore: 100,
                  notes: `Direct match verified.`,
                  dataQualityWarnings: normalizedRow.dataQualityWarnings,
                  candidates: candidates.map(c => ({
                      uniqueId: c.record.UniqueID, 
                      rating: mapRecordToRating(c.record),
                      matchedKDEs: c.description, reliabilityScore: c.isPerfect ? 100 : 0, notes: c.description
                  }))
              };
          } else if (normalizedRow.dataQualityWarnings.includes('obsolete_entry')) {
               uniqueResults[uIdx] = {
                   uniqueId: "N/A", matchedKDEs: "N/A", rating: Rating.Unknown, reliabilityScore: 0,
                   notes: "Product marked as OBSOLETE.",
                   dataQualityWarnings: normalizedRow.dataQualityWarnings
               };
          } else {
              itemsRequiringAI.push({ input: normalizedRow, index: uIdx });
          }
      }));

      onProgress(Math.min(i + CORRELATION_BATCH_SIZE, uniqueItems.length), total, `Correlation: Processing database matches (${Math.min(i + CORRELATION_BATCH_SIZE, uniqueItems.length)} of ${uniqueItems.length})...`);
  }

  // 3. AI Analysis Phase for remaining items
  // (Same batch processing as before, but using itemsRequiringAI)
  if (itemsRequiringAI.length > 0) {
    // @ts-ignore
    for (let i = 0; i < itemsRequiringAI.length; i += (BATCH_SIZE * MAX_CONCURRENT_BATCHES)) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const batchPromises = [];
        for (let j = 0; j < MAX_CONCURRENT_BATCHES; j++) {
            const start = i + (j * BATCH_SIZE);
            // @ts-ignore
            if (start >= itemsRequiringAI.length) break;
            // @ts-ignore
            const batch = itemsRequiringAI.slice(start, start + BATCH_SIZE);
            batchPromises.push(rateBatch(batch).then(results => {
                results.forEach((res, idx) => {
                    const globalIdx = start + idx;
                    // @ts-ignore
                    uniqueResults[itemsRequiringAI[globalIdx].index] = res;
                });
            }));
        }
        await Promise.all(batchPromises);
        onProgress(uniqueItems.length - itemsRequiringAI.length + i, total, "Inference: Processing AI responses...");
        await new Promise(r => setTimeout(r, API_DELAY_MS));
    }
  }

  // 4. Map back to original indices
  const finalResults: AnalysisResult[] = new Array(total);
  uniqueItems.forEach((item, uIdx) => {
      const sig = getRowSignature(item);
      signatureToIndices.get(sig)?.forEach(idx => {
          finalResults[idx] = uniqueResults[uIdx];
      });
  });

  onProgress(total, total, "Analysis complete.");
  return finalResults;
}

function mapRecordToRating(record: any): Rating {
    if (record.RecType === 'CERT') return Rating.Certified;
    const color = (record.RatingColor || '').toLowerCase();
    if (color === 'green') return Rating.BestChoice;
    if (color === 'yellow') return Rating.GoodAlternative;
    if (color === 'red') return Rating.Avoid;
    return Rating.NA;
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
    // 1. Filter out already cached terms
    const uncachedSpecies = species.filter(s => !termNormalizationCache.species.has(s));
    const uncachedCountries = countries.filter(c => !termNormalizationCache.countries.has(c));
    const uncachedMethods = methods.filter(m => !termNormalizationCache.methods.has(m));

    if (uncachedSpecies.length === 0 && uncachedCountries.length === 0 && uncachedMethods.length === 0) {
        const result: any = { species: {}, countries: {}, methods: {} };
        species.forEach(s => result.species[s] = termNormalizationCache.species.get(s));
        countries.forEach(c => result.countries[c] = termNormalizationCache.countries.get(c));
        methods.forEach(m => result.methods[m] = termNormalizationCache.methods.get(m));
        return result;
    }

    const canonical = getCanonicalTerms();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const schema = {
        type: Type.OBJECT,
        properties: {
            species: { type: Type.OBJECT, additionalProperties: { type: Type.STRING } },
            countries: { type: Type.OBJECT, additionalProperties: { type: Type.STRING } },
            methods: { type: Type.OBJECT, additionalProperties: { type: Type.STRING } }
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
                contents: `Normalize these terms:\nSpecies: ${JSON.stringify(uncachedSpecies)}\nCountries: ${JSON.stringify(uncachedCountries)}\nMethods: ${JSON.stringify(uncachedMethods)}`,
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    temperature: 0.0
                }
            });
            const data = JSON.parse(response.text.trim());
            
            // 2. Update cache
            Object.entries(data.species || {}).forEach(([k, v]) => termNormalizationCache.species.set(k, v as string));
            Object.entries(data.countries || {}).forEach(([k, v]) => termNormalizationCache.countries.set(k, v as string));
            Object.entries(data.methods || {}).forEach(([k, v]) => termNormalizationCache.methods.set(k, v as string));

            // Return full requested mapping (including previously cached)
            const full: any = { species: {}, countries: {}, methods: {} };
            species.forEach(s => full.species[s] = termNormalizationCache.species.get(s) || s);
            countries.forEach(c => full.countries[c] = termNormalizationCache.countries.get(c) || c);
            methods.forEach(m => full.methods[m] = termNormalizationCache.methods.get(m) || m);
            return full;
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
