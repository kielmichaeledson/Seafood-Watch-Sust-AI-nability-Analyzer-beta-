
import { Rating } from '../types';

export interface KDERow {
  speciesCommonName?: string;
  scientificNameHint?: string;
  country?: string;
  subnational?: string;
  bodyOfWater?: string;
  method?: string;
  farmedWild?: string;
  certificationInline?: string;
  multiOriginCountries?: string[];
  stockUnit?: string;
  dataQualityWarnings: string[];
  [key: string]: any; 
}

export type SchemaType = 'Standard' | 'A_Compact' | 'B_ProductSource' | 'C_Disney' | 'D_Nestle';

export function detectSchema(headers: string[], firstRows: any[][]): SchemaType {
    const headStr = headers.join('|').toLowerCase();

    // Schema D - Nestle Purina (Detection: Blank line + Nestle/Purina title)
    // Actually, detectSchema is usually called AFTER initial parsing. 
    // In our app, we map columns. But the user specifically asked for a schema detection layer.
    if (firstRows.length > 2 && String(firstRows[0][0] || '').includes('Purina')) return 'D_Nestle';
    
    // Schema B - Product Source (Full text)
    if (headers.some(h => h.toLowerCase() === 'product source') && headers.length < 5) return 'B_ProductSource';

    // Schema A - California Fish Grill (Species, Method, Location)
    if (headers.length >= 3 && 
        headers.some(h => h.toLowerCase() === 'species') && 
        headers.some(h => h.toLowerCase().includes('catch / farm method')) &&
        headers.some(h => h.toLowerCase().includes('catch / farm location'))) {
        return 'A_Compact';
    }

    // Schema C - Disney
    if (headers.some(h => h.toLowerCase().includes('fishery/farm name'))) return 'C_Disney';

    return 'Standard';
}

export function normalizeRow(row: any, schema: SchemaType, columnMapping: Record<string, string>): KDERow {
    let kde: KDERow = { dataQualityWarnings: [] };

    // 1. Drop pre-existing rating/notes columns
    const keysToDrop = [/sfw\s*rating/i, /seafood\s*watch\s*rating/i, /^rating$/i, /sfw\s*notes/i, /assessment\s*id/i, /rec\s*id/i];
    const filteredRow: any = {};
    Object.keys(row).forEach(key => {
        if (!keysToDrop.some(re => re.test(key))) {
            filteredRow[key] = row[key];
        }
    });

    if (schema === 'B_ProductSource') {
        const productSource = String(row[columnMapping['Product Source']] || row['Product Source'] || '');
        kde = { ...kde, ...parseProductSource(productSource) };
    } else if (schema === 'A_Compact') {
        const spec = String(row[columnMapping['Common name']] || row['Species'] || '');
        const meth = String(row[columnMapping['Production Method']] || row['Catch / Farm Method'] || '');
        const loc = String(row[columnMapping['Source country']] || row['Catch / Farm Location'] || '');
        kde = { ...kde, ...parseCompactSchema(spec, meth, loc) };
        kde.dataQualityWarnings.push('schema_compact');
    } else if (schema === 'C_Disney') {
        const fisheryName = String(row['Fishery/Farm name'] || '');
        kde = { ...kde, ...parseDisneyFisheryName(fisheryName) };
        // Merge with standard mappings if standard columns exist as fallback/augment
        if (!kde.speciesCommonName) kde.speciesCommonName = String(row[columnMapping['Common name']] || '');
    } else {
        // Standard Mapping
        kde.speciesCommonName = String(row[columnMapping['Common name']] || '');
        kde.scientificNameHint = String(row[columnMapping['Scientific name']] || '');
        kde.country = String(row[columnMapping['Source country']] || '');
        kde.subnational = String(row[columnMapping['Subnational area']] || '');
        kde.bodyOfWater = String(row[columnMapping['Body of water']] || '');
        kde.method = String(row[columnMapping['Production Method']] || '');
        kde.farmedWild = String(row[columnMapping['Wild or Farmed']] || '');
        kde.certificationInline = String(row[columnMapping['Certification']] || '');
    }

    return cleanAndRepairKDERow(kde);
}

function parseProductSource(productSource: string): Partial<KDERow> {
    const parts = productSource.split(' - ').map(s => s.trim());
    const speciesCommonName = parts[0];
    const wildFarmedIdx = parts.findIndex(p => /^(wild|farmed)$/i.test(p));
    if (wildFarmedIdx === -1) return { speciesCommonName };
    const farmedWild = parts[wildFarmedIdx];
    const method = parts.slice(wildFarmedIdx + 1).join(', ') || undefined;
    const countryRaw = parts[1]?.replace(/\s*\([^)]+\)/g, '').trim();
    const subnational = parts.slice(2, wildFarmedIdx)
      .map(p => p.replace(/\s*\([^)]+\)/g, '').trim())
      .filter(Boolean).join(', ') || undefined;
    const certInline = parts.slice(1, wildFarmedIdx)
      .flatMap(p => { const m = p.match(/\(([^)]+)\)/g); return m ?? []; })
      .map(s => s.replace(/[()]/g, '').trim()).join(', ') || undefined;
    const nonCountries = ['worldwide', 'unassessed origin', 'pacific ocean', 'atlantic', 'high seas'];
    const isNonCountry = nonCountries.includes(countryRaw?.toLowerCase() ?? '');
    return {
      speciesCommonName,
      country: isNonCountry ? undefined : countryRaw,
      bodyOfWater: isNonCountry ? countryRaw : undefined,
      subnational,
      farmedWild,
      method,
      certificationInline: certInline,
    };
}

function parseCompactSchema(species: string, method: string, location: string): Partial<KDERow> {
    const speciesClean = species
      .replace(/\s+\d[\d\/\.\s]*(oz|lb|ct|pc|pcs|g|kg|fillet|strip|cube|portion|trim|p&d|tail|head|off|on)[\s\w]*/gi, '')
      .trim();
    const locationParts = location.split(/[\/,]/).map(s => s.trim()).filter(Boolean);
    const bowTerms = ['western central pacific', 'mediterranean', 'pacific', 'atlantic',
      'pacific coast', 'west coast', 'pac. coast', 'uswest coast'];
    const isBow = bowTerms.some(t => location.toLowerCase().replace(/\s+/g, ' ').includes(t));
    return {
      speciesCommonName: speciesClean,
      method,
      country: isBow || locationParts.length > 1 ? undefined : locationParts[0],
      bodyOfWater: isBow ? location : undefined,
      multiOriginCountries: !isBow && locationParts.length > 1 ? locationParts : undefined,
    };
}

function parseDisneyFisheryName(fisheryName: string): Partial<KDERow> {
    if (!fisheryName) return {};
    const s = fisheryName.trim();
  
    if (s.includes('[')) {
      const tokens = s.match(/\[([^\]]+)\]/g)?.map(t => t.slice(1, -1)) ?? [];
      const subdivision = s.match(/Subdivision:\s*(.+)$/)?.[1]?.trim();
      const certToken = tokens.find(t => /MSC|ASC|BAP|GGAP|GlobalG\.A\.P\./i.test(t));
      const nonCertTokens = tokens.filter(t => t !== certToken);
      return {
        speciesCommonName: nonCertTokens[0],
        country: nonCertTokens[1],
        subnational: subdivision ?? nonCertTokens[2],
        method: nonCertTokens.find(t => /pen|trawl|line|pot|trap|aquaculture|culture/i.test(t)),
        certificationInline: certToken,
      };
    }
  
    if (s.includes('|')) {
      const parts = s.split('|').map(p => p.trim());
      const firstPart = parts[0].split(' - ');
      const species = firstPart[0]?.trim();
      const stockUnit = firstPart.slice(1).join(' - ').trim();
      const certMatch = s.match(/\[([A-Z]+):\s*([^\]]+)\]/);
      const certInline = certMatch?.[1]; 
      const methodPart = parts[parts.length - 1].replace(/\[[^\]]+\]/g, '').trim();
      const countryPart = parts[parts.length - 2]?.trim();
      return {
        speciesCommonName: species,
        stockUnit,
        country: countryPart,
        method: methodPart,
        certificationInline: certInline,
      };
    }
  
    const dashParts = s.split('-').map(p => p.trim()).filter(Boolean);
    const countryRaw = dashParts[1];
    const multiOrigin = countryRaw?.includes('/') || countryRaw?.includes(',')
      ? countryRaw.split(/[\/,]/).map(c => c.trim())
      : undefined;
    return {
      speciesCommonName: dashParts[0],
      country: multiOrigin ? undefined : countryRaw,
      multiOriginCountries: multiOrigin,
      method: dashParts[2] || undefined,
      certificationInline: dashParts[3] || undefined,
    };
}

export function cleanAndRepairKDERow(kde: KDERow): KDERow {
    // 1. Trim and collapse spaces
    const clean = (s?: string) => s?.trim().replace(/\s{2,}/g, ' ');
    kde.speciesCommonName = clean(kde.speciesCommonName);
    kde.country = clean(kde.country);
    kde.subnational = clean(kde.subnational);
    kde.bodyOfWater = clean(kde.bodyOfWater);
    kde.method = clean(kde.method);
    kde.farmedWild = clean(kde.farmedWild);

    // 2. Skip OBSOLETE
    if (kde.speciesCommonName?.toUpperCase() === 'OBSOLETE') {
        return { ...kde, speciesCommonName: undefined, dataQualityWarnings: ['obsolete_entry'] };
    }

    // 3. Farmed/Wild Repair
    const fw = (kde.farmedWild || '').toLowerCase();
    const wildFarmedTerms = ['wild', 'farmed'];
    if (fw && !wildFarmedTerms.includes(fw)) {
        // Detect shifted gear
        const farmImplying = ['ocean pen', 'pens', 'ponds', 'pond', 'net pens', 'tanks', 'raceways', 'contained', 'freshwater net pens'];
        const wildImplying = ['longlines', 'trawls', 'gillnets', 'handline', 'purse seines', 'traps', 'dredges', 'jig'];
        
        if (farmImplying.some(t => fw.includes(t))) {
            kde.farmedWild = 'Farmed';
            kde.dataQualityWarnings.push('production_type_inferred');
        } else if (wildImplying.some(t => fw.includes(t))) {
            kde.farmedWild = 'Wild';
            kde.dataQualityWarnings.push('production_type_inferred');
        } else {
            kde.farmedWild = undefined;
            kde.dataQualityWarnings.push('production_type_unknown');
        }
    } else if (fw) {
        kde.farmedWild = fw.charAt(0).toUpperCase() + fw.slice(1);
    } else {
        kde.dataQualityWarnings.push('production_type_unknown');
    }

    // 4. Country Normalization (Basic hints)
    const c = (kde.country || '').toLowerCase();
    if (c === 'usa' || c.includes('united states of america')) kde.country = 'United States';
    if (c === 'equador') kde.country = 'Ecuador';
    if (c === 'columbia') kde.country = 'Colombia';
    if (c === 'chili') kde.country = 'Chile';
    if (c.includes('philippines')) kde.country = 'Philippines';
    if (c === 'icelandic') { kde.country = 'Iceland'; kde.dataQualityWarnings.push('country_normalized'); }
    if (c === 'alaskan') { kde.country = 'United States'; kde.subnational = 'Alaska'; kde.dataQualityWarnings.push('country_normalized'); }

    if (['pacific', 'atlantic', 'fao', 'high seas'].some(t => c.includes(t))) {
        kde.bodyOfWater = kde.country;
        kde.country = undefined;
    }

    if (c === 'worldwide') {
        kde.dataQualityWarnings.push('country_worldwide');
    }

    // 5. Method cleaning
    if (kde.method?.toLowerCase().includes('emailed')) {
        kde.method = undefined;
        kde.dataQualityWarnings.push('method_missing');
    }

    return kde;
}
