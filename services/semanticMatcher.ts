
import { GoogleGenAI, Type } from "@google/genai";
import { getSemanticCache, saveSemanticCache } from "./dbService";
import speciesData from '../data/species.json';

declare var process: {
  env: {
    API_KEY: string;
  };
};

export type MatchCategory = 'country' | 'method';

export const SPECIES_SYNONYM_MAP: Record<string, string> = {
    // European seabass (CA Fish Grill: 'BRANZINO 3-5oz')
    'branzino': 'european seabass',
    'bronzini': 'european seabass',
    'branzini': 'european seabass',
    'loup de mer': 'european seabass',
    'european sea bass': 'european seabass',
    'mediterranean sea bass': 'european seabass',
    
    // Sablefish (PCC: 'black cod or sablefish')
    'black cod': 'sablefish',
    'butterfish': 'sablefish',
    'alaska black cod': 'sablefish',
    'black cod or sablefish': 'sablefish',
    'gindara': 'sablefish',
    
    // Mahi / Dolphinfish
    'mahi': 'dolphinfish',
    'mahi mahi': 'dolphinfish',
    'mahi-mahi': 'dolphinfish',
    'dorado': 'dolphinfish',
    'common dolphinfish': 'dolphinfish',
    
    // Wahoo (PCC: 'ono or wahoo')
    'ono': 'wahoo',
    'ono or wahoo': 'wahoo',
    
    // Lingcod / Rockfish
    'ling cod': 'lingcod',
    'rock fish': 'rockfish',
    'rock cod': 'rockfish',
    'vermilion rockfish': 'rockfish',
    
    // Pollock (MOMs: 'Alaskan Pollock')
    'alaskan pollock': 'alaska pollock',
    'walleye pollock': 'alaska pollock',
    'pacific pollock': 'alaska pollock',
    
    // Cod (MOMs: 'Alaskan Cod', 'Icelandic Cod')
    'alaskan cod': 'pacific cod',
    'market cod': 'pacific cod',
    'true cod': 'pacific cod',
    'icelandic cod': 'atlantic cod',
    
    // Salmon shortforms (PCC: 'Coho', 'Sockeye', 'king or chinook salmon')
    'coho': 'coho salmon',
    'coho or silver salmon': 'coho salmon',
    'silver salmon': 'coho salmon',
    'sockeye': 'sockeye salmon',
    'red salmon': 'sockeye salmon',
    'chinook': 'chinook salmon',
    'king salmon': 'chinook salmon',
    'king or chinook salmon': 'chinook salmon',
    'keta': 'chum salmon',
    'chum': 'chum salmon',
    'keta salmon': 'chum salmon',
    'pink salmon': 'pink salmon',
    'humpy': 'pink salmon',
    'steelhead': 'rainbow trout',
    'steelhead trout': 'rainbow trout',
    'norweigan salmon': 'atlantic salmon',
    'norwegian salmon': 'atlantic salmon',
    'farmed salmon': 'atlantic salmon',
    
    // Char
    'char': 'arctic char',
    'charr': 'arctic char',
    'arctic charr': 'arctic char',
    
    // Catfish (MOMs: 'Blue Catfish')
    'blue catfish': 'blue catfish',
    'catfish': 'channel catfish',
    
    // Shrimp (PCC: 'Blue Shrimp' = Litopenaeus stylirostris, distinct from whiteleg)
    'blue shrimp': 'blue shrimp',
    'white shrimp': 'whiteleg shrimp',
    'whiteleg shrimp': 'whiteleg shrimp',
    'vannamei': 'whiteleg shrimp',
    'spot shrimp': 'sidestriped shrimp',
    'spot prawns': 'sidestriped shrimp',
    'prawns': 'whiteleg shrimp',
    'pink shrimp': 'pink shrimp',
    'shrimp meat': 'whiteleg shrimp',
    'argentine red shrimp': 'argentine red shrimp',
    'giant tiger prawn': 'giant tiger prawn',
    
    // Crab (PCC: 'dungeness crab meat')
    'dungeness': 'dungeness crab',
    'dungeness crab meat': 'dungeness crab',
    'snow crab': 'snow/queen crab',
    'queen crab': 'snow/queen crab',
    'opilio crab': 'snow/queen crab',
    'golden king crab': 'golden king crab',
    'red king crab': 'red king crab',
    'soft shell crab': 'blue crab',
    'soft shells': 'blue crab',
    'jonah crab': 'jonah crab',
    'blue swimming crab': 'blue swimming crab',
    
    // Lobster (PCC: 'lobster tails', 'Spiny Lobster (Caribbean)')
    'lobster tails': 'american lobster',
    'maine lobster': 'american lobster',
    'spiny lobster': 'caribbean spiny lobster',
    'spiny lobster (caribbean)': 'caribbean spiny lobster',
    'rock lobster': 'caribbean spiny lobster',
    'scampi': 'norway lobster',
    'langoustine': 'norway lobster',
    'langostino': 'squat lobster',
    'lobsterette': 'norway lobster',
    
    // Squid (CA Fish Grill: 'CALAMARI STRIPS'; Pacific Catch: 'California Market Squid', 'Longfin Squid', 'Northern Shortfin Squid')
    'calamari': 'longfin inshore squid',
    'calamari strips': 'longfin inshore squid',
    'market squid': 'opalescent inshore squid',
    'california market squid': 'opalescent inshore squid',
    'longfin squid': 'longfin inshore squid',
    'northern shortfin squid': 'northern shortfin squid',
    
    // Clams (Pacific Catch: 'Pacific Littleneck Clams')
    'pacific littleneck clams': 'manila clam',
    'littleneck': 'northern quahog',
    'countneck': 'northern quahog',
    'quahog': 'northern quahog',
    'cockle': 'common cockle',
    'new zealand cockles': 'common cockle',
    'hard clams nei': 'meretrix clams',
    'manila clam': 'manila clam',
    
    // Scallops
    'sea scallops': 'sea scallop',
    'american sea scallop': 'sea scallop',
    'diver scallop': 'sea scallop',
    'queen scallops': 'queen scallop',
    'yesso scallop': 'yesso scallop',
    'pacific calico scallop': 'calico scallop',
    
    // Oysters / mussels (PCC: 'oysters', 'mussels' generic)
    'pacific oysters': 'pacific oyster',
    'east coast oyster': 'eastern oyster',
    'oysters': 'eastern oyster',
    'american cupped oyster': 'eastern oyster',
    'mussels': 'northern blue mussel',
    'blue mussel': 'northern blue mussel',
    'new zealand mussel': 'green-lipped mussel',
    'green lip musselss': 'green-lipped mussel',
    'chilean mussel': 'chilean mussel',
    'mediterranean mussels': 'mediterranean mussel',
    
    // Flatfish
    'halibut': 'atlantic halibut',
    'pacific halibut': 'pacific halibut',
    'petrale sole': 'petrale sole',
    'dover sole': 'dover sole',
    'grey sole': 'witch flounder',
    'lemon sole': 'winter flounder',
    'fluke': 'summer flounder',
    'european plaice': 'european plaice',
    
    // Tuna (CA Fish Grill: 'TUNA 7-9 OZ'; PCC: 'ahi tuna', 'albacore tuna')
    'ahi': 'yellowfin tuna',
    'ahi tuna': 'yellowfin tuna',
    'albacore tuna': 'albacore',
    'albacore': 'albacore',
    'bluefin tuna': 'atlantic bluefin tuna',
    
    // Other
    'swai': 'pangasius',
    'basa': 'pangasius',
    'tra': 'pangasius',
    'pangas catfishes nei': 'pangasius',
    'tilapia': 'tilapia',
    'nile tilapia': 'tilapia',
    'barramundi': 'barramundi',
    'barramundi perch': 'barramundi',
    'almaco jack': 'almaco jack',
    'cobia': 'cobia',
    'striped bass': 'striped bass',
    'sunshine bass': 'striped bass',
    'surimi': 'alaska pollock',
    'imitation crab': 'alaska pollock',
    'chilean sea bass': 'patagonian toothfish',
    'monkfish': 'goosefish',
    'american angler': 'goosefish',
    'tilefish': 'golden tilefish',
    'great northern tilefish': 'golden tilefish',
    'swordfish': 'swordfish',
    'spiny dogfish': 'spiny dogfish',
    'mako shark': 'shortfin mako shark',
    'black sea bass': 'black sea bass',
    'paralichthys dentatus': 'summer flounder',
    'red drum': 'red drum',
    'northern red snapper': 'red snapper',
    'red snapper': 'red snapper',
    'yellowtail amberjack': 'yellowtail',
    'japanese amberjack': 'yellowtail',
    'arctic char': 'arctic char',
    'white sturgeon': 'white sturgeon',
    'russian sturgeon': 'russian sturgeon',
    'danube sturgeon': 'russian sturgeon',
    'siberian sturgeon': 'siberian sturgeon',
    'sterlet sturgeon': 'sterlet sturgeon',
    'red swamp crawfish': 'red swamp crawfish',
    'crawfish': 'red swamp crawfish',
    'common octopus': 'common octopus',
    'red sea urchin': 'red sea urchin',
};

export const SCIENTIFIC_TO_COMMON: Record<string, string> = {
    'gadus morhua': 'atlantic cod',
    'gadus macrocephalus': 'pacific cod',
    'melanogrammus aeglefinus': 'haddock',
    'pollachius virens': 'pollock',
    'theragra chalcogramma': 'alaska pollock',
    'gadus chalcogrammus': 'alaska pollock',
    'hippoglossus hippoglossus': 'atlantic halibut',
    'hippoglossus stenolepis': 'pacific halibut',
    'solea solea': 'dover sole',
    'microstomus pacificus': 'dover sole',
    'eopsetta jordani': 'petrale sole',
    'glyptocephalus zachirus': 'rex sole',
    'salmo salar': 'atlantic salmon',
    'oncorhynchus mykiss': 'rainbow trout',
    'oncorhynchus tshawytscha': 'chinook salmon',
    'oncorhynchus nerka': 'sockeye salmon',
    'oncorhynchus kisutch': 'coho salmon',
    'oncorhynchus keta': 'chum salmon',
    'oncorhynchus gorbuscha': 'pink salmon',
    'salvelinus alpinus': 'arctic char',
    'morone saxatilis': 'striped bass',
    'thunnus albacares': 'yellowfin tuna',
    'thunnus thynnus': 'atlantic bluefin tuna',
    'thunnus obesus': 'bigeye tuna',
    'thunnus alalunga': 'albacore',
    'katsuwonus pelamis': 'skipjack tuna',
    'xiphias gladius': 'swordfish',
    'isurus oxyrinchus': 'shortfin mako shark',
    'squalus acanthias': 'spiny dogfish',
    'litopenaeus setiferus': 'white shrimp',
    'litopenaeus vannamei': 'whiteleg shrimp',
    'whiteleg shrimp': 'whiteleg shrimp',
    'litopenaeus stylirostris': 'blue shrimp',
    'penaeus monodon': 'giant tiger prawn',
    'penaeus aztecus': 'brown shrimp',
    'farfantepenaeus duorarum': 'pink shrimp',
    'pandalus jordani': 'pink shrimp',
    'pandalus borealis': 'northern shrimp',
    'homarus americanus': 'american lobster',
    'homarus gammarus': 'european lobster',
    'nephrops norvegicus': 'norway lobster',
    'callinectes sapidus': 'blue crab',
    'cancer magister': 'dungeness crab',
    'metacarcinus magister': 'dungeness crab',
    'paralithodes camtschaticus': 'red king crab',
    'chionoecetes opilio': 'snow/queen crab',
    'oreochromis niloticus': 'tilapia',
    'pangasianodon hypophthalmus': 'pangasius',
    'pangasius spp': 'pangasius',
    'ictalurus punctatus': 'channel catfish',
    'ictalurus furcatus': 'blue catfish',
    'dicentrarchus labrax': 'european seabass',
    'lates calcarifer': 'barramundi',
    'dissostichus eleginoides': 'patagonian toothfish',
    'anoplopoma fimbria': 'sablefish',
    'opiodon elongatus': 'lingcod',
    'sebastes': 'rockfish',
    'sebastes spp': 'rockfish',
    'sebastes miniatus': 'rockfish',
    'pleuronectidae': 'flatfish',
    'lutjanus spp': 'snapper',
    'lutjanus campechanus': 'red snapper',
    'lutjanus sebae': 'red snapper',
    'mycteroperca microlepis': 'gag',
    'mycteroperca bonaci': 'black grouper',
    'coryphaena hippurus': 'dolphinfish',
    'acanthocybium solandri': 'wahoo',
    'rachycentron canadum': 'cobia',
    'scomberomorus cavalla': 'king mackerel',
    'pomatomus saltatrix': 'bluefish',
    'centropristis striata': 'black sea bass',
    'paralichthys dentatus': 'summer flounder',
    'mercenaria mercenaria': 'northern quahog',
    'venerupis philippinarum': 'manila clam',
    'meretrix spp': 'meretrix clams',
    'meretrix lyrata': 'meretrix clams',
    'argopecten irradians': 'bay scallop',
    'argopecten ventricosus': 'calico scallop',
    'placopecten magellanicus': 'sea scallop',
    'mizuhopecten yessoensis': 'yesso scallop',
    'patinopecten yessoensis': 'yesso scallop',
    'crassostrea virginica': 'eastern oyster',
    'magallana gigas': 'pacific oyster',
    'mytilus edulis': 'northern blue mussel',
    'mytilus chilensis': 'chilean mussel',
    'mytilus galloprovincialis': 'mediterranean mussel',
    'perna canaliculus': 'green-lipped mussel',
    'doryteuthis opalescens': 'opalescent inshore squid',
    'loligo pealeii': 'longfin inshore squid',
    'doryteuthis (amerigo) pealeii': 'longfin inshore squid',
    'seriola quinqueradiata': 'yellowtail',
    'seriola lalandi': 'yellowtail',
    'seriola rivoliana': 'almaco jack',
    'sciaenops ocellatus': 'red drum',
    'procambarus clarkii': 'red swamp crawfish',
    'acipenser transmontanus': 'white sturgeon',
    'acipenser gueldenstaedtii': 'russian sturgeon',
    'aceipenser gueldenstaedtii': 'russian sturgeon',
    'acipenser baerii': 'siberian sturgeon',
    'acipenser ruthenus': 'sterlet sturgeon',
    'octopus vulgaris': 'common octopus',
    'mesocentrotus franciscanus': 'red sea urchin',
    'strongylocentrotus franciscanus': 'red sea urchin',
    'hyperoglyphe antarctica': 'bluenose warehou',
    'pangasiidae': 'pangasius',
    'pleoticus muelleri': 'argentine red shrimp',
};

// Auto-populate from speciesData for missing scientific names
speciesData.forEach(s => {
    if (s.scientific && s.common) {
        // Handle comma-separated scientific names (e.g. for Clams)
        const scientificNames = s.scientific.split(',').map(name => name.trim().toLowerCase());
        scientificNames.forEach(scientific => {
            if (scientific && !SCIENTIFIC_TO_COMMON[scientific]) {
                SCIENTIFIC_TO_COMMON[scientific] = s.common.toLowerCase();
            }
        });
    }
});

export const COUNTRY_NORMALIZATION_MAP: Record<string, string> = {
    'united states of america (the)': 'United States',
    'united states of america': 'United States',
    'u.s.': 'United States',
    'u.s.a.': 'United States',
    'usa': 'United States',
    'philippines (the)': 'Philippines',
    'korea, republic of': 'South Korea',
    'viet nam': 'Vietnam',
    'russian federation (the)': 'Russia',
};

export const GEAR_FAMILY_MEMBERS: Record<string, string[]> = {
    'ponds': ['ponds','pond','semi-intensive ponds','intensive ponds','extensive ponds',
              'pond, frequent exchange','fully extensive','earthen ponds','silvocuture','silviculture','intensive pond'],
    'net pens': ['net pens','pens','marine net pens','ocean pen','cages net pens',
                 'freshwater net pens','sea cages','offshore cages','submersible net pen','open net pen',
                 'cage - floating','cage - fixed','marine net pen','cages_net_pens'],
    'tanks': ['tanks','recirculating tanks','indoor recirculating tanks',
              'outdoor recirculating tanks','raceways','raceway','outdoor flowthrough raceways',
              'indoor flowthrough raceway','flow-through tanks','contained','tanks - flow-through',
              'tanks - recirculatory system (ras)','recirculatory system (ras)','raceway - flow-through',
              'indoor recirculating tanks (with wastewater treatment)','outdoor recirculating tanks (with wastewater treatment)'],
    'bottom culture': ['bottom culture','on-bottom culture','off-bottom culture',
                       'off-bottom cultured','raft culture','longline culture','bag culture','suspended culture','on bottom','rope grown',
                       'miscellaneous - rope grown','off bottom (bivalves)','off-bottom culture: raft culture'],
    'dredges': ['dredges','towed dredges','mechanized dredges','hand dredges',
                'hydraulic dredges','dredges (unspecified)'],
    'traps': ['traps','pots','trap/pot','pot/trap','traps (unspecified)','fyke nets','pound nets',
              'weirs','vertical lines'],
    'hooks and lines': ['hooks and lines','hooks_and_lines','longlines','longline',
                        'set longlines','drifting longlines','longline (deep-set)',
                        'longlines (deep-set)','longlines (shallow-set)','longlines (unspecified)',
                        'bottom longline','bottom longlines','handlines','handline',
                        'hand-operated pole-and-lines','handlines and hand-operated pole and lines',
                        'hook and line','hooks and lines, other',
                        'mechanized lines and pole-and-lines','jigging','trolling lines',
                        'trolling','pole and line', 'pole-and-line', 'jig','trotline','gill net & troll',
                        'longlines & trawls (unspecified)','hooks and line','dsbg','deep-set buoy gear'],
    'gillnets': ['gillnets','gillnet','gill net','gillnets and entangling nets',
                 'gillnets_and_entangling_nets','set gillnets','drift gillnets',
                 'drift gillnets (driftnets)','combined gillnets - trammel nets',
                 'trammel nets','entangling nets','entangling nets: trammel nets',
                 'gillnets (unspecified)','reefnets','reffnets','lift nets','life nets'],
    'trawls': ['trawls','trawl','bottom trawls','bottom trawl','btm/midwater trawl',
               'midwater trawls','pelagic trawls','otter trawl','beam trawls',
               'skimmer trawls','small mesh bottom trawls','trawls (unspecified)','trawls, other',
               'trawls and long line (unspecified)'],
    'seines': ['seines','purse seines','purse seine','beach seines','lampara nets',
               'unassociated purse seine (non-fad)','associated purse seine (fad)',
               'purse seine, other','seine nets','suripera net','suripera','danish seines','surrounding nets'],
    'diving': ['diving','hand implements','hand picking','rakes and forks','harvesting machines', 'hand'],
    'cast nets': ['cast nets','falling gear','falling_gear'],
    'wild-caught unspecified': ['wild-caught','wild caught','unassessed fishing methods',
                                'miscellaneous gears','miscellaneous'],
};

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
    const i = input.toLowerCase().trim().replace(/_/g, ' ');
    const d = database.toLowerCase().trim().replace(/_/g, ' ');
    
    // 1. Exact match (fast path)
    if (i === d) {
        return { score: 1.0, relationship: 'exact' };
    }

    // Check Synonym Map
    if (category === 'method') {
        const iFamily = Object.keys(GEAR_FAMILY_MEMBERS).find(fam => 
            GEAR_FAMILY_MEMBERS[fam].includes(i)
        );
        const dFamily = Object.keys(GEAR_FAMILY_MEMBERS).find(fam => 
            GEAR_FAMILY_MEMBERS[fam].includes(d)
        );
        if (iFamily && dFamily && iFamily === dFamily) {
            return { score: 1.0, relationship: 'equivalent' };
        }
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
