
import { GoogleGenAI, Type } from "@google/genai";
import { getSemanticCache, saveSemanticCache } from "./dbService";

declare var process: {
  env: {
    API_KEY: string;
  };
};

export type MatchCategory = 'country' | 'method';

export interface MatchResult {
    score: number;
    relationship: 'exact' | 'equivalent' | 'related' | 'distinct';
    explanation?: string;
}

// Simple cache to avoid redundant AI calls
const matchCache = new Map<string, MatchResult>();

export async function evaluateSemanticMatch(
    input: string, 
    database: string, 
    category: MatchCategory
): Promise<MatchResult> {
    const i = input.toLowerCase().trim();
    const d = database.toLowerCase().trim();
    
    // 1. Exact match (fast path)
    if (i === d) {
        return { score: 1.0, relationship: 'exact' };
    }

    // 2. Check cache
    const cacheKey = `${category}:${i}:${d}`;
    if (matchCache.has(cacheKey)) {
        return matchCache.get(cacheKey)!;
    }
    
    const persistentMatch = await getSemanticCache(cacheKey);
    if (persistentMatch) {
        matchCache.set(cacheKey, persistentMatch);
        return persistentMatch;
    }

    // 3. Heuristics for common cases to save API calls (Common Seafood Watch Aliases)
    if (category === 'country') {
        const usAliases = ['us', 'usa', 'u.s.', 'u.s.a.', 'united states', 'united states of america', 'eez-usa', 'eez-us'];
        const cnAliases = ['cn', 'china', 'mainland china', 'eez-china'];
        const vnAliases = ['vn', 'vietnam', 'viet nam', 'eez-vietnam'];
        const caAliases = ['ca', 'canada', 'eez-canada'];
        
        if (usAliases.includes(i) && usAliases.includes(d)) return { score: 1.0, relationship: 'equivalent' };
        if (cnAliases.includes(i) && cnAliases.includes(d)) return { score: 1.0, relationship: 'equivalent' };
        if (vnAliases.includes(i) && vnAliases.includes(d)) return { score: 1.0, relationship: 'equivalent' };
        if (caAliases.includes(i) && caAliases.includes(d)) return { score: 1.0, relationship: 'equivalent' };

        // FAO Area codes to names
        const faoMap: Record<string, string[]> = {
            'northeast atlantic': ['fao 27', 'area 27', '27'],
            'northwest atlantic': ['fao 21', 'area 21', '21'],
            'northeast pacific': ['fao 67', 'area 67', '67'],
            'northwest pacific': ['fao 61', 'area 61', '61'],
            'western central pacific': ['fao 71', 'area 71', '71'],
            'eastern central pacific': ['fao 77', 'area 77', '77'],
            'western central atlantic': ['fao 31', 'area 31', '31'],
            'eastern central atlantic': ['fao 34', 'area 34', '34'],
            'southeast pacific': ['fao 87', 'area 87', '87'],
            'southwest pacific': ['fao 81', 'area 81', '81'],
        };

        for (const [canonical, aliases] of Object.entries(faoMap)) {
            if ((i === canonical || aliases.includes(i)) && (d === canonical || aliases.includes(d))) {
                return { score: 1.0, relationship: 'equivalent' };
            }
        }
    }
    
    if (category === 'method') {
        const lineAliases = ['handline', 'handlines', 'pole-and-line', 'pole and line', 'trolling', 'trolling lines', 'line', 'lines'];
        const netAliases = ['gillnet', 'gillnets', 'set gillnets', 'drift gillnets', 'trammel nets'];
        const trapAliases = ['pots', 'traps', 'pots/traps', 'pot', 'trap', 'cages'];
        const seineAliases = ['purse seine', 'purse-seine', 'encircling gillnets', 'surround nets'];
        
        if (lineAliases.includes(i) && lineAliases.includes(d)) return { score: 1.0, relationship: 'equivalent' };
        if (netAliases.includes(i) && netAliases.includes(d)) return { score: 1.0, relationship: 'equivalent' };
        if (trapAliases.includes(i) && trapAliases.includes(d)) return { score: 1.0, relationship: 'equivalent' };
        if (seineAliases.includes(i) && seineAliases.includes(d)) return { score: 1.0, relationship: 'equivalent' };
    }

    // 4. AI-driven evaluation for more complex cases
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const schema = {
            type: Type.OBJECT,
            properties: {
                score: { type: Type.NUMBER, description: "Similarity score from 0.0 to 1.0" },
                relationship: { 
                    type: Type.STRING, 
                    enum: ['exact', 'equivalent', 'related', 'distinct'],
                    description: "The semantic relationship between the terms."
                },
                explanation: { type: Type.STRING }
            },
            required: ["score", "relationship"]
        };

        const prompt = `Evaluate the semantic relationship between these two ${category} terms in the context of seafood sourcing and sustainability reporting.
        Input Term: "${input}"
        Database Term: "${database}"
        
        Rules for ${category}:
        ${category === 'method' ? `
        - METHOD FAMILIES: Terms MUST belong to the same gear family to be 'equivalent' or 'related'. 
        - Broad vs Specific: A broad family name (e.g., "Purse seine") can match a specific entry in that family (e.g., "Unassociated purse seine (non-FAD)") as 'equivalent' or 'related'.
        - FAMILY MISMATCH: If terms are from different families (e.g., "Purse seine" vs "Handline", "Trawl" vs "Gillnet"), they MUST be 'distinct'.
        ` : `
        - Equivalent: Terms referring to the same entity (e.g., "US" and "United States").
        - FAO Areas: Numeric codes or names (e.g., "FAO 27", "Area 67") are equivalent to their geographical names (e.g., "Northeast Atlantic", "Northeast Pacific").
        `}
        - 'Equivalent' means they refer to the same thing or a broad category matching a specific member of that category.
        - 'Related' means they are in the same category/family but have some differences.
        - 'Distinct' means they are different and should not be matched.
        - Return a score of 1.0 for 'exact' or 'equivalent', 0.5-0.8 for 'related', and 0.0 for 'distinct'.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
                temperature: 0.0
            }
        });

        const result = JSON.parse(response.text.trim()) as MatchResult;
        matchCache.set(cacheKey, result);
        await saveSemanticCache(cacheKey, result);
        return result;

    } catch (error) {
        console.warn(`Semantic match failed for ${i} vs ${d}:`, error);
        // Fallback to simple inclusion check
        const isRelated = i.includes(d) || d.includes(i);
        return { 
            score: isRelated ? 0.5 : 0, 
            relationship: isRelated ? 'related' : 'distinct' 
        };
    }
}
