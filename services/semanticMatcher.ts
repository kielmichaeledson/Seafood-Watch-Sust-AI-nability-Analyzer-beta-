
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

    // 3. Heuristics for common cases to save API calls
    if (category === 'country') {
        if ((i === 'us' || i === 'usa' || i === 'u.s.' || i === 'u.s.a.') && 
            (d === 'united states' || d === 'united states of america')) {
            return { score: 1.0, relationship: 'equivalent' };
        }
    }
    
    if (category === 'method') {
        if (i.includes('troll') && d.includes('trolling lines')) {
            return { score: 1.0, relationship: 'equivalent' };
        }
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
        
        Rules:
        - 'Equivalent' means they refer to the same thing (e.g., "US" and "United States", "Trolls" and "Trolling lines").
        - 'Related' means they are in the same category but distinct (e.g., "Handlines" and "Hand-operated pole-and-lines").
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
