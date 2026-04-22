
import { Rating } from '../types';
import { evaluateSemanticMatch } from './semanticMatcher';

export interface SeafoodRecord {
  UniqueID: string;
  CommonName: string;
  ScientificName: string;
  FAOCommonName: string;
  FDACommonName: string;
  SubnationalArea: string;
  EconomicZone: string;
  Methods: string;
  RatingColor: string;
  ProductionMethod: string;
}

let parsedDatabase: Map<string, SeafoodRecord> | null = null;
let databaseArray: SeafoodRecord[] = [];
// Pre-calculated index for faster species lookups
let speciesIndex: Map<string, SeafoodRecord[]> = new Map();

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseAndPopulate(csvText: string) {
  const newMap = new Map<string, SeafoodRecord>();
  const newArray: SeafoodRecord[] = [];
  const newIndex = new Map<string, SeafoodRecord[]>();
  
  const lines = csvText.split('\n');
  const headerLine = lines[0];
  if (!headerLine) return;
  
  const headers = parseCSVLine(headerLine);
  const idIndex = headers.indexOf('UniqueID');
  const productionMethodIndex = headers.indexOf('ProductionMethod');
  const commonNameIndex = headers.indexOf('CommonName');
  const scientificNameIndex = headers.indexOf('ScientificName');
  const faoNameIndex = headers.indexOf('FAOCommonName');
  const fdaNameIndex = headers.indexOf('FDACommonName');
  const subnationalIndex = headers.indexOf('SubnationalArea');
  const economicZoneIndex = headers.indexOf('EconomicZone');
  const methodsIndex = headers.indexOf('Methods');
  const ratingColorIndex = headers.indexOf('RatingColor');
  
  // Filtering headers
  const reportStatusIndex = headers.indexOf('ReportStatus');
  const ratedUnratedIndex = headers.indexOf('RatedUnrated');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cols = parseCSVLine(line);
    const id = cols[idIndex];
    
    // Check if the row meets the specific filtering criteria requested
    // If the columns exist, we strictly check for 'Published' and 'Rated'
    // If they don't exist (like in the fallback data), we assume they are valid
    const status = reportStatusIndex !== -1 ? cols[reportStatusIndex] : 'Published';
    const rated = ratedUnratedIndex !== -1 ? cols[ratedUnratedIndex] : 'Rated';
    const ratingColor = ratingColorIndex !== -1 ? cols[ratingColorIndex] : '';

    if (status !== 'Published' || rated !== 'Rated' || !ratingColor || ratingColor.toLowerCase() === 'n/a' || ratingColor.toLowerCase() === 'unrated') {
      continue;
    }

    if (id) {
      const record: SeafoodRecord = {
        UniqueID: id,
        ProductionMethod: cols[productionMethodIndex] || 'F',
        CommonName: cols[commonNameIndex] || '',
        ScientificName: cols[scientificNameIndex] || '',
        FAOCommonName: cols[faoNameIndex] || '',
        FDACommonName: cols[fdaNameIndex] || '',
        SubnationalArea: cols[subnationalIndex] || '',
        EconomicZone: cols[economicZoneIndex] || '',
        Methods: cols[methodsIndex] || '',
        RatingColor: cols[ratingColorIndex] || ''
      };
      newMap.set(id, record);
      newArray.push(record);

      // Index by all known names for faster lookup
      const names = new Set([
        record.CommonName.toLowerCase(),
        record.ScientificName.toLowerCase(),
        record.FAOCommonName.toLowerCase(),
        record.FDACommonName.toLowerCase()
      ].filter(n => n && n !== '""'));

      names.forEach(name => {
        if (!newIndex.has(name)) newIndex.set(name, []);
        newIndex.get(name)!.push(record);
      });
    }
  }

  parsedDatabase = newMap;
  databaseArray = newArray;
  speciesIndex = newIndex;
}

export async function loadDatabaseFromUrl(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch database: ${response.status}`);
    const text = await response.text();
    parseAndPopulate(text);
  } catch (error) {
    console.warn(`Falling back to embedded data.`, error);
    parseAndPopulate(REFERENCE_CSV);
  }
}

function initializeDatabase() {
  if (parsedDatabase) return;
  parseAndPopulate(REFERENCE_CSV);
}

export function getSeafoodById(id: string): { matchedKDEs: string; rating: Rating; notes?: string } | null {
  initializeDatabase();
  const record = parsedDatabase?.get(id);
  if (!record) return null;

  return {
    matchedKDEs: formatKDE(record),
    rating: mapColorToRating(record.RatingColor)
  };
}

function formatKDE(record: SeafoodRecord): string {
    const type = record.ProductionMethod === 'A' ? 'Farmed' : 'Wild';
    const sub = record.SubnationalArea && record.SubnationalArea !== '""' ? record.SubnationalArea : 'N/A';
    const country = record.EconomicZone && record.EconomicZone !== '""' ? record.EconomicZone : 'N/A';
    const method = record.Methods && record.Methods !== '""' ? record.Methods : 'N/A';
    return `${record.CommonName} (${type}) | ${sub} | ${country} | ${method}`;
}

function mapColorToRating(color: string): Rating {
    const c = (color || '').toLowerCase();
    if (c === 'green') return Rating.BestChoice;
    if (c === 'yellow') return Rating.GoodAlternative;
    if (c === 'red') return Rating.Avoid;
    if (c === 'certified') return Rating.Certified;
    return Rating.NA;
}

export interface Candidate {
    record: SeafoodRecord;
    score: number;
    description: string;
    isPerfect: boolean;
}

export function getCanonicalTerms(): { species: string[]; countries: string[]; methods: string[] } {
  initializeDatabase();
  const species = new Set<string>();
  const countries = new Set<string>();
  const methods = new Set<string>();

  databaseArray.forEach(record => {
    if (record.CommonName) species.add(record.CommonName);
    if (record.ScientificName) species.add(record.ScientificName);
    if (record.EconomicZone) countries.add(record.EconomicZone);
    if (record.Methods) {
        // Methods can sometimes be comma separated in other datasets, but here we split by typical separators if any
        record.Methods.split(/[;,]/).forEach(m => {
            const trimmed = m.trim();
            if (trimmed && trimmed.length > 2) methods.add(trimmed);
        });
    }
  });

  return {
    species: Array.from(species).sort(),
    countries: Array.from(countries).sort(),
    methods: Array.from(methods).sort()
  };
}

export async function findCandidates(
    criteria: { species?: string; country?: string; subnational?: string; method?: string; farmedWild?: string; bodyOfWater?: string }, 
    limit: number = 5,
    skipAI: boolean = false
): Promise<Candidate[]> {
    initializeDatabase();

    const species = (criteria.species || '').toLowerCase().trim();
    const country = (criteria.country || '').toLowerCase().trim();
    const subnational = (criteria.subnational || '').toLowerCase().trim();
    const method = (criteria.method || '').toLowerCase().trim();
    const farmedWild = (criteria.farmedWild || '').toLowerCase().trim();
    const bodyOfWater = (criteria.bodyOfWater || '').toLowerCase().trim();

    // Market Name Synonyms (Internal mapping for common mismatches)
    const synonymMap: Record<string, string[]> = {
        'chilean seabass': ['patagonian toothfish', 'antarctic toothfish'],
        'patagonian toothfish': ['chilean seabass'],
        'white tuna': ['albacore', 'escolar'],
        'calamari': ['squid'],
        'scampi': ['langoustine', 'norway lobster'],
    };

    const speciesSearchTerms = new Set([species]);
    if (synonymMap[species]) {
        synonymMap[species].forEach(s => speciesSearchTerms.add(s));
    }

    // PERFORMANCE: Start with records that match species name exactly if possible
    let recordsToSearch = databaseArray;
    
    // Check all search terms in the index
    const indexedMatches: SeafoodRecord[] = [];
    speciesSearchTerms.forEach(term => {
        if (speciesIndex.has(term)) {
            indexedMatches.push(...speciesIndex.get(term)!);
        }
    });

    if (indexedMatches.length > 0) {
        recordsToSearch = indexedMatches;
        // If we have very few matches, we might want to broaden back to full search, 
        // but usually indexed matches are what we want.
    }

    // 1. Initial Species Filtering (Fast Heuristic)
    const speciesCandidates = recordsToSearch.map(record => {
        let score = 0;
        const recNames = [
            record.CommonName.toLowerCase(),
            record.ScientificName.toLowerCase(),
            record.FAOCommonName.toLowerCase(),
            record.FDACommonName.toLowerCase()
        ];

        // SCORING LOGIC (Mapped to Seafood Watch Dataset Fields)
        // 1. Species Match -> CommonName (Primary), ScientificName, FAOCommonName, FDACommonName
        let speciesMatched = false;
        speciesSearchTerms.forEach(term => {
            if (recNames.some(rn => rn === term)) {
                score += 100;
                speciesMatched = true;
            } else if (recNames.some(rn => rn.includes(term))) {
                // Database record is more specific than the search term
                score += 40;
                speciesMatched = true;
            } else if (recNames.some(rn => term.includes(rn) && rn.length > 3)) {
                // Search term is more specific than the database record
                score += 35;
                speciesMatched = true;
            }
        });

        return { record, score, speciesMatched };
    }).filter(c => c.speciesMatched || !species);

    // 2. Semantic Evaluation for Country and Method (AI-Driven)
    // To maintain performance, we only evaluate the top species matches (e.g., top 20)
    const sortedSpeciesCandidates = speciesCandidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

    const finalCandidates = await Promise.all(sortedSpeciesCandidates.map(async (c) => {
        const record = c.record;
        let score = c.score;
        let isPerfect = c.score === 100; // Species must be perfect to start
        
        const recZone = record.EconomicZone.toLowerCase();
        const recSub = record.SubnationalArea.toLowerCase();
        const recMethod = record.Methods.toLowerCase();

        // 2. Country/Location Match -> EconomicZone (Semantic/AI-Driven)
        // We combine country and body of water (including FAO areas) for a better location match
        const locationInput = [country, bodyOfWater].filter(Boolean).join(' ');
        if (locationInput) {
            const match = skipAI 
                ? (locationInput === recZone || recZone.includes(locationInput) || locationInput.includes(recZone) ? { relationship: 'related' as const } : { relationship: 'distinct' as const })
                : await evaluateSemanticMatch(locationInput, recZone, 'country');
            
            if (match.relationship === 'exact' || match.relationship === 'equivalent') {
                score += 60;
            } else if (match.relationship === 'related') {
                score += 30;
                isPerfect = false;
            } else if (recZone === 'worldwide' || recZone === 'global') {
                score += 30;
                isPerfect = false;
            } else {
                // Strict mismatch: if location is provided and doesn't match EconomicZone
                return { record, score: 0, description: formatKDE(record), isPerfect: false };
            }
        } else if (recZone && recZone !== 'worldwide' && recZone !== 'global') {
            // Database has a specific country but input doesn't
            isPerfect = false;
        }

        // 3. Subnational Match -> SubnationalArea
        if (subnational && recSub && recSub !== 'n/a' && recSub !== 'global' && recSub !== 'worldwide') {
            if (recSub === subnational) {
                score += 60;
            } else if (recSub.includes(subnational) || subnational.includes(recSub)) {
                score += 30;
                isPerfect = false;
            } else {
                // Both have specific subnational areas and they don't match
                return { record, score: 0, description: formatKDE(record), isPerfect: false };
            }
        } else if (subnational) {
            // Input has subnational but DB is broad (empty/global)
            score += 30;
            isPerfect = false;
        } else if (recSub && recSub !== 'n/a' && recSub !== 'global' && recSub !== 'worldwide') {
            // DB has subnational but input doesn't
            isPerfect = false;
        }

        // 4. Method Match -> Methods (Semantic/AI-Driven)
        if (method) {
            const match = skipAI
                ? (method === recMethod || recMethod.includes(method) || method.includes(recMethod) ? { relationship: 'related' as const } : { relationship: 'distinct' as const })
                : await evaluateSemanticMatch(method, recMethod, 'method');
            
            if (match.relationship === 'exact' || match.relationship === 'equivalent') {
                score += 50;
            } else if (match.relationship === 'related') {
                score += 25;
                isPerfect = false;
            } else {
                // Method mismatch (different families)
                return { record, score: 0, description: formatKDE(record), isPerfect: false };
            }
        } else if (recMethod && recMethod !== 'n/a' && recMethod !== 'unknown') {
            // DB has method but input doesn't
            isPerfect = false;
        }

        // 5. Production Type Match -> ProductionMethod ('A' for Farmed, 'F' for Wild)
        if (farmedWild) {
          const isFarmedInput = farmedWild.includes('farm') || farmedWild.includes('aqua');
          const isWildInput = farmedWild.includes('wild') || farmedWild.includes('fish');
          const isFarmedDB = record.ProductionMethod === 'A';
          const isWildDB = record.ProductionMethod === 'F';

          if (isFarmedInput && isFarmedDB) {
              score += 40;
          } else if (isWildInput && isWildDB) {
              score += 40;
          } else {
              // Strict mismatch on production type
              return { record, score: 0, description: formatKDE(record), isPerfect: false };
          }
        }

        return {
            record,
            score,
            description: formatKDE(record),
            isPerfect
        };
    }));

    return finalCandidates
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

// Fallback database for prototype
export const REFERENCE_CSV = `UniqueID,ProductionMethod,ReportTitle,ReportURL,CommonName,SeafoodCategory,ScientificName,FAOCommonName,FDACommonName,FAO3ACode,StockUnits,IndustryLinkId,EconomicZone,ISOAlpha2,ISOAlpha3,SubnationalArea,BOWs,FAOMajors,FAOBOWs,FAOMajorCodes,VesselFlag,SpecificFishery,ManagementUnits,PermitLicense,Substrate,Companies,Methods,rfmoArea,RatingColor,RatingScore
14,F,"Amberjack, greater (US) - TSC",https://sfw-images.s3-accelerate.amazonaws.com/reports/A/seafood-watch-great-amber-jack-us-5.pdf,Greater amberjack,Amberjack,Seriola dumerili,Greater amberjack,Greater Amberjack,AMB,,,United States,US,USA,,Western Central Atlantic Ocean,"Atlantic, Western Central",,31,United States,,,,,,Diving,,Yellow,2.76
15,F,"Amberjack, greater (US) - TSC",https://sfw-images.s3-accelerate.amazonaws.com/reports/A/seafood-watch-great-amber-jack-us-5.pdf,Greater amberjack,Amberjack,Seriola dumerili,Greater amberjack,Greater Amberjack,AMB,,,United States,US,USA,,Western Central Atlantic Ocean,"Atlantic, Western Central",,31,United States,,,,,,Handlines and hand-operated pole-and-lines,,Yellow,2.724
16,F,"Amberjack, greater (US) - TSC",https://sfw-images.s3-accelerate.amazonaws.com/reports/A/seafood-watch-great-amber-jack-us-5.pdf,Greater amberjack,Amberjack,Seriola dumerili,Greater amberjack,Greater Amberjack,AMB,,,United States,US,USA,,Gulf of Mexico,"Atlantic, Western Central",,31,United States,,,,,,Diving,,Yellow,2.959
17,F,"Amberjack, greater (US) - TSC",https://sfw-images.s3-accelerate.amazonaws.com/reports/A/seafood-watch-great-amber-jack-us-5.pdf,Greater amberjack,Amberjack,Seriola dumerili,Greater amberjack,Greater Amberjack,AMB,,,United States,US,USA,,Gulf of Mexico,"Atlantic, Western Central",,31,United States,,,,,,Handlines and hand-operated pole-and-lines,,Yellow,2.777
20,F,Yellowtail (Mexico),https://sfw-images.s3-accelerate.amazonaws.com/reports/Y/seafood-watch-yellowtail-mexico-6.pdf,Yellowtail,Amberjack,Seriola lalandi,Yellowtail amberjack,Yellowtail,YTC,,,Mexico,MX,MEX,,Eastern Central Pacific Ocean,"Pacific, Eastern Central",,77,Mexico,,,,,,Drift gillnets,,Red,1.788
21,F,Yellowtail (Mexico),https://sfw-images.s3-accelerate.amazonaws.com/reports/Y/seafood-watch-yellowtail-mexico-6.pdf,Yellowtail,Amberjack,Seriola lalandi,Yellowtail amberjack,Yellowtail,YTC,,,Mexico,MX,MEX,,Gulf of California,"Pacific, Eastern Central",,77,Mexico,,,,,,Encircling gillnets,,Yellow,2.674
259,F,Cod and Pollock (Canada Atlantic),https://sfw-images.s3-accelerate.amazonaws.com/reports/C/seafood-watch-atlantic-cod-pollock-canada-37.pdf,Atlantic cod,Cod,Gadus morhua,Atlantic cod,Atlantic Cod,COD,"Northern Gulf of St. Lawrence (3Pn, 4RS)",,Canada,CA,CAN,Newfoundland and Labrador,Gulf of St. Lawrence,"Atlantic, Northwest",,21,Canada,,,,,,Set gillnets,,Red,1.726
339,F,"Groundfish (rockfishes, thornyheads, sablefish, Atka mackerel, Greenland turbot, Pacific cod), Alaska",https://sfw-images.s3-accelerate.amazonaws.com/reports/G/seafood-watch-groundfish-alaska-42.pdf,Pacific cod,Cod,Gadus macrocephalus,Pacific cod,Pacific Cod,PCO,,,United States,US,USA,Alaska,Bering Sea,"Pacific, Northeast",,67,United States,Pacific Cod Longline Fishery,,,,,Set longlines,,Green,3.588
399,F,"Crab, blue swimming (Philippines)",https://sfw-images.s3-accelerate.amazonaws.com/reports/C/seafood-watch-swimmer-crab-philippines-53.pdf,Blue swimming crab,Crab,Portunus pelagicus,Blue swimming crab,Blue Swimming Crab,SCD,,,Philippines,PH,PHL,Palawan,Western Central Pacific Ocean,"Pacific, Western Central",,71,Philippines,,,,,,Gillnets and entangling nets,,Red,1.491
412,F,"Crab,  blue (US)",https://sfw-images.s3-accelerate.amazonaws.com/reports/C/seafood-watch-blue-crab-us-57.pdf,Blue crab,Crab,Callinectes sapidus,Blue crab,Blue Crab,CRB,,,United States,US,USA,Alabama,Gulf of Mexico,"Atlantic, Western Central",,31,United States,,,,,,Pots,,Yellow,2.354
433,F,"Crab, Dungeness (California,Oregon,Washington,British Columbia,Alaska)",https://sfw-images.s3-accelerate.amazonaws.com/reports/C/seafood-watch-dungeness-crab-us-canada-58.pdf,Dungeness crab,Crab,Metacarcinus magister,,Dungeness Crab,,,,Canada,CA,CAN,British Columbia,Northeast Pacific Ocean,"Pacific, Northeast",,67,Canada,,,,,,Pots,,Yellow,3.111
1352,F,"Salmon, Pacific (British Columbia)",https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-chinook-coho-salmon-bc-165.pdf,Chinook salmon,Salmon,Oncorhynchus tshawytscha,Chinook(=Spring=King) salmon,Chinook Salmon,CHI,,,Canada,CA,CAN,British Columbia,Stikine River | Taku River,,,,Canada,,,,,,Drift gillnets,,Yellow,3.39
1375,F,"Salmon, Pacific (US West Coast)",https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-pacific-salmon-us-168.pdf,Chinook salmon,Salmon,Oncorhynchus tshawytscha,Chinook(=Spring=King) salmon,Chinook Salmon,CHI,,,United States,US,USA,,Eastern Central Pacific Ocean | Northeast Pacific Ocean,"Pacific, Northeast | Pacific, Eastern Central",,67|77,United States,This Chinook fishery is temporarily closed due to low numbers of salmon.,Chinook fishery - Horse Mt. to U.S./Mexico Border,,,,Trolling lines,,Yellow,2.238
1978,A,Tilapia (China),https://sfw-images.s3-accelerate.amazonaws.com/reports/T/seafood-watch-tilapia-china-239.pdf,Hybrid tilapia,Tilapia,Oreochromis niloticus x Oreochromis aureus,,,,,,China,CN,CHN,,,,,,,,,,,,Ponds,,Red,1.96
26071,A,Shrimp (Thailand),https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-shrimp-thailand-601.pdf,Whiteleg shrimp,Shrimp,Litopenaeus vannamei,,Whiteleg Shrimp,,,,Thailand,TH,THA,,,,,,,,,,,,Intensive pond,,Yellow,3.46
30539,A,Shrimp (Ecuador),https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-farmed-whiteleg shrimp-ecuador-27637.pdf,Whiteleg shrimp,Shrimp,Litopenaeus vannamei,,Whiteleg Shrimp,,,,Ecuador,EC,ECU,,,"America, South - Inland Waters",,3,,,,,,,Semi-intensive pond,,Yellow,4.02
31571,A,Shrimp (India),https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-farmed-shrimp-india-731.pdf,Whiteleg shrimp,Shrimp,Litopenaeus vannamei,,Whiteleg Shrimp,,,,India,IN,IND,,,Asia - Inland Waters,,4,,,,,,,Ponds,,Red,2.41
34733,A,Shrimp (Vietnam),https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-whiteleg-shrimp-giant-tiger-prawn-vietnam-27793.pdf,Giant tiger prawn,Shrimp,Penaeus monodon,Giant tiger prawn,Giant Tiger Prawn,GIT,,,Vietnam,VN,VNM,,,,,,,,,,,,Extensive pond,,Yellow,3.84
34734,A,Shrimp (Vietnam),https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-whiteleg-shrimp-giant-tiger-prawn-vietnam-27793.pdf,Giant tiger prawn,Shrimp,Penaeus monodon,Giant tiger prawn,Giant Tiger Prawn,GIT,,,Vietnam,VN,VNM,,,,,,,,,,,,Silvoculture,,Yellow,4.7
34735,A,Shrimp (Vietnam),https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-whiteleg-shrimp-giant-tiger-prawn-vietnam-27793.pdf,Whiteleg shrimp,Shrimp,Litopenaeus vannamei,,Whiteleg Shrimp,,,,Vietnam,VN,VNM,,,,,,,,,,,,Intensive pond,,Red,2.2
36077,A,Shrimp (United States),https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-farmed-shrimp-us-27834.pdf,Whiteleg shrimp,Shrimp,Litopenaeus vannamei,,Whiteleg Shrimp,,,,United States,US,USA,,,,,,,,,,,,Ponds,,Green,7.01
31562,A,"Salmon, Atlantic (Atlantic Canada, Maine, US)",https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-farmed-salmon-us-canada-atlantic-989.pdf,Atlantic salmon,Salmon,Salmo salar,Atlantic salmon,Atlantic Salmon,SAL,,,Canada,CA,CAN,New Brunswick,Northwest Atlantic Ocean,"Atlantic, Northwest",,21,,,,,,,Marine net pen,,Red,3.53
31564,A,"Salmon, Atlantic (Norway)",https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-farmed-salmon-norway-987.pdf,Atlantic salmon,Salmon,Salmo salar,Atlantic salmon,Atlantic Salmon,SAL,,,Norway,NO,NOR,,Area 1: The Swedish Border to Jæren,"Atlantic, Northeast",,27,,,,,,,Marine net pen,,Yellow,3.54
31566,A,"Salmon, Atlantic and coho (Chile)",https://sfw-images.s3-accelerate.amazonaws.com/reports/S/seafood-watch-farmed-salmon-chile-988.pdf,Atlantic salmon,Salmon,Salmo salar,Atlantic salmon,Atlantic Salmon,SAL,,,Chile,CL,CHL,Los Lagos,Southeast Pacific Ocean,"Pacific, Southeast",,87,,,,,,,Marine net pen,,Red,3.53
99999,F,"Certification",,,Certification,,,,,,,,,,,,,,,,,,,,,,Certified,0
`;
