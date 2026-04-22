
import { Rating } from '../types';
import fuzzysort from 'fuzzysort';
import MiniSearch from 'minisearch';

export interface SeafoodRecord {
  UniqueID: string;
  RecType: string;
  CommonName: string;
  ScientificName: string;
  FAOCommonName: string;
  FDACommonName: string;
  SubnationalArea: string;
  EconomicZone: string;
  BodyOfWater: string;
  Methods: string;
  RatingColor: string;
  ProductionMethod: string;
  HarvestCertification: string;
  HarvestCertificationStandard: string;
}

let parsedDatabase: Map<string, SeafoodRecord> | null = null;
let databaseArray: SeafoodRecord[] = [];
let certifiedArray: SeafoodRecord[] = []; // New separate array for cert matches
let speciesIndex: Map<string, SeafoodRecord[]> = new Map();
let miniSearch: MiniSearch<any> | null = null;

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
  const newCertArray: SeafoodRecord[] = [];
  const newIndex = new Map<string, SeafoodRecord[]>();
  
  const lines = csvText.split('\n');
  const headerLine = lines[0];
  if (!headerLine) return;
  
  const headers = parseCSVLine(headerLine);
  
  const getIdx = (name: string) => headers.indexOf(name);
  
  const idIndex = getIdx('UniqueID');
  const recTypeIndex = getIdx('RecType');
  const productionMethodIndex = getIdx('ProductionMethod');
  const commonNameIndex = getIdx('CommonName');
  const scientificNameIndex = getIdx('ScientificName');
  const faoNameIndex = getIdx('FAOCommonName');
  const fdaNameIndex = getIdx('FDACommonName');
  const subnationalIndex = getIdx('SubnationalArea');
  const economicZoneIndex = getIdx('EconomicZone');
  const bowsIndex = getIdx('BOWs');
  const methodsIndex = getIdx('Methods');
  const ratingColorIndex = getIdx('RatingColor');
  const harvestCertIndex = getIdx('HarvestCertification');
  const harvestCertStdIndex = getIdx('HarvestCertificationStandard');

  const getCol = (cols: string[], idx: number) => (idx !== -1 ? (cols[idx] || '').trim() : '');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cols = parseCSVLine(line);
    const id = getCol(cols, idIndex);
    
    if (!id) continue;

    const ratingColor = getCol(cols, ratingColorIndex);
    const recType = getCol(cols, recTypeIndex) || 'SFW';

    const record: SeafoodRecord = {
      UniqueID: id,
      RecType: recType,
      ProductionMethod: getCol(cols, productionMethodIndex) || 'F',
      CommonName: getCol(cols, commonNameIndex),
      ScientificName: getCol(cols, scientificNameIndex),
      FAOCommonName: getCol(cols, faoNameIndex),
      FDACommonName: getCol(cols, fdaNameIndex),
      SubnationalArea: getCol(cols, subnationalIndex),
      EconomicZone: getCol(cols, economicZoneIndex),
      BodyOfWater: getCol(cols, bowsIndex),
      Methods: getCol(cols, methodsIndex),
      RatingColor: ratingColor,
      HarvestCertification: getCol(cols, harvestCertIndex),
      HarvestCertificationStandard: getCol(cols, harvestCertStdIndex)
    };
    
    newMap.set(id, record);
    
    if (recType === 'CERT') {
      newCertArray.push(record);
    } else {
      newArray.push(record);
    }

    // Index by all known names for faster lookup
    const names = new Set([
      record.CommonName.toLowerCase(),
      record.ScientificName.toLowerCase(),
      record.FAOCommonName.toLowerCase(),
      record.FDACommonName.toLowerCase()
    ].filter(n => n && n !== '""' && n.length > 2));

    names.forEach(name => {
      if (!newIndex.has(name)) newIndex.set(name, []);
      newIndex.get(name)!.push(record);
    });
  }

  // Build MiniSearch Index
  miniSearch = new MiniSearch({
    fields: ['CommonName', 'ScientificName', 'FAOCommonName', 'FDACommonName', 'EconomicZone', 'SubnationalArea', 'BodyOfWater', 'Methods', 'HarvestCertification'],
    storeFields: ['UniqueID', 'RecType'],
    idField: 'UniqueID',
    searchOptions: {
      prefix: true,
      fuzzy: 0.2
    }
  });
  
  miniSearch.addAll([...newArray, ...newCertArray]);

  parsedDatabase = newMap;
  databaseArray = newArray;
  certifiedArray = newCertArray;
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

export function getSeafoodById(id: string): { matchedKDEs: string; rating: Rating; notes?: string; rawRecord: SeafoodRecord } | null {
  initializeDatabase();
  const record = parsedDatabase?.get(id);
  if (!record) return null;
  const raw = record;

  return {
    matchedKDEs: formatKDE(record),
    rating: mapColorToRating(record.RatingColor),
    rawRecord: raw
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
    criteria: { species?: string; country?: string; subnational?: string; method?: string; farmedWild?: string; bodyOfWater?: string; certification?: string }, 
    limit: number = 8,
    skipAI: boolean = false
): Promise<Candidate[]> {
    initializeDatabase();

    const species = (criteria.species || '').trim();
    const country = (criteria.country || '').trim();
    const subnational = (criteria.subnational || '').trim();
    const method = (criteria.method || '').trim();
    const farmedWild = (criteria.farmedWild || '').trim();
    const bodyOfWater = (criteria.bodyOfWater || '').trim();
    const certOrg = (criteria.certification || '').trim();

    if (!species) return [];

    // Fast Pool Selection using MiniSearch
    const query = [species, country, subnational, bodyOfWater, certOrg].filter(Boolean).join(' ');
    const results = miniSearch?.search(query, {
        boost: {
            CommonName: 4,
            ScientificName: 3,
            FAOCommonName: 2,
            FDACommonName: 2,
            HarvestCertification: 3
        },
        prefix: true,
        fuzzy: term => term.length > 3 ? 0.2 : 0
    });

    if (!results || results.length === 0) return [];

    // Second track: Score and refine candidates in the pool
    const candidates = results.map(res => {
        const record = parsedDatabase!.get(res.id)!;
        
        // Start with MiniSearch score (boosted)
        let score = res.score * 10;

        const recZone = (record.EconomicZone || '').toLowerCase();
        const recSub = (record.SubnationalArea || '').toLowerCase();
        const recMethod = (record.Methods || '').toLowerCase();
        const lCountry = country.toLowerCase();
        const lMethod = method.toLowerCase();
        const lFarmedWild = farmedWild.toLowerCase();
        const lBodyOfWater = bodyOfWater.toLowerCase();
        const lCertOrg = certOrg.toLowerCase();

        // 1. Geographic Scoring
        const geoScore = (term: string) => {
            if (!term) return 0;
            if (term === 'worldwide') return 15;
            if (recZone === 'worldwide') return 40;
            if (recZone.includes(term) || term.includes(recZone)) return 40;
            if (recSub.includes(term) || term.includes(recSub)) return 30;
            return 0;
        };
        const locationScore = Math.max(geoScore(lCountry), geoScore(lBodyOfWater));
        score += locationScore;

        // 1.5 Species-Method Probability Filtering
        const getPlausibility = (s: string, m: string) => {
            const ls = s.toLowerCase();
            const lm = m.toLowerCase();
            // Bivalves (Oysters, Mussels, Clams) vs Active Towed Gear (Trawl, Seine)
            if (['oyster', 'mussel', 'clam', 'scallop'].some(b => ls.includes(b))) {
                if (['trawl', 'seine', 'gillnet'].some(g => lm.includes(g))) return -50;
            }
            // Small pelagics vs Static Bottom Gear
            if (['anchovy', 'sardine', 'herring'].some(p => ls.includes(p))) {
                if (['bottom longline', 'pot', 'trap'].some(g => lm.includes(g))) return -30;
            }
            // Shrimp vs Handline/Harpoon
            if (ls.includes('shrimp') && (lm.includes('handline') || lm.includes('harpoon'))) return -40;
            return 0;
        };
        const plausibilityScore = getPlausibility(record.CommonName, lMethod);
        score += plausibilityScore;

        // 2. Method Scoring
        if (lMethod) {
            if (recMethod.includes(lMethod) || lMethod.includes(recMethod)) {
                score += 50;
            } else if (record.Methods === 'All production methods') {
                score += 40;
            }
        }

        // 3. Production Method (F/A)
        if (lFarmedWild) {
            const isFarmedInput = lFarmedWild.startsWith('f');
            const isWildInput = lFarmedWild.startsWith('w');
            const isFarmedDB = record.ProductionMethod === 'A';
            const isWildDB = record.ProductionMethod === 'F';

            if ((isFarmedInput && isFarmedDB) || (isWildInput && isWildDB)) {
                score += 40;
            } else if ((isFarmedInput && isWildDB) || (isWildInput && isFarmedDB)) {
                score = 0; // Hard mismatch
            }
        }

        // 4. CERT Org Match
        if (record.RecType === 'CERT' && lCertOrg) {
            const recCert = record.HarvestCertification.toLowerCase();
            const certMap: Record<string, string> = {
                'msc': 'marine stewardship council certified',
                'asc': 'aquaculture stewardship council certified',
                'bap': 'best aquaculture practices (bap) certified',
                'naturland': 'naturland certified',
                'fos': 'friend of the sea certified'
            };
            const normalizedInputCert = certMap[lCertOrg] || lCertOrg;
            if (recCert.includes(normalizedInputCert) || normalizedInputCert.includes(recCert)) {
                score += 50;
            }
        }

        // High confidence direct match check
        const hasExactCountry = country && (recZone === lCountry || recSub === lCountry);
        const hasExactSub = !subnational || recSub === subnational.toLowerCase();
        const hasExactBow = !bodyOfWater || (record.BodyOfWater || '').toLowerCase().includes(lBodyOfWater);
        const hasExactMethod = !method || recMethod.includes(lMethod) || lMethod.includes(recMethod) || record.Methods === 'All production methods';
        
        const isPerfect = (res.score > 30 && hasExactCountry && hasExactSub && hasExactBow && hasExactMethod);

        return { record, score, description: formatKDE(record), isPerfect };
    });

    return candidates
        .filter(c => c.score > 15)
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
