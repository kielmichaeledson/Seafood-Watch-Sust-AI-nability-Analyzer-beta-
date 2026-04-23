
export const normalizeSpecies = (name: string) => {
  if (!name || name === 'Unknown') return 'Unknown';
  let n = name.toLowerCase().trim();
  
  // Strip common "messy" prefixes/suffixes (size, packaging, processing)
  n = n.replace(/\d+\s*(oz|lb|g|kg|ct|pc|pcs|ptn|sku|fz|iqf|p&d|bulk)[\s\w]*/gi, '');
  n = n.replace(/\b(skin-on|skinless|boneless|pbo|rwa|factor|classic|portion|fillet|filleted|premium|wild-caught|farm-raised|fresh|frozen|cold smoked|hot smoked|smoked|natural|original|salted|in brine|in oil|in water)\b/gi, '');
  n = n.replace(/[\(\)-]\s*[\d\w\s]*\s*[\)\-]/g, ''); // Remove parenthetical info like "(10 oz)" or "- Bulk"
  
  // 2025 Format: "Atlantic halibut - Scotian Shelf..." -> Extract "Atlantic halibut"
  if (n.includes(' - ')) {
    n = n.split(' - ')[0].trim();
  }
  
  // 2025 Format: "...[Atlantic salmon][Chile]..." -> Extract info from brackets
  if (n.includes('[')) {
    const bracketMatch = n.match(/\[(.*?)\]/);
    if (bracketMatch) {
      n = bracketMatch[1].trim();
    }
  }

  // 2025 Format: "Atlantic Halibut-Norway-Longlines-" -> Extract from dash separators
  if (n.includes('-') && !n.includes(' ')) {
    const parts = n.split('-');
    // Pick the one that looks most like a species
    n = parts.find(p => p.length > 3 && !/msc|asc|bap|vnp|gap/i.test(p)) || parts[0];
  }

  n = n.trim().replace(/\s{2,}/g, ' ');

  if (n.includes('coho')) return 'Coho Salmon';
  if (n.includes('sockeye')) return 'Sockeye Salmon';
  if (n.includes('atlantic salmon')) return 'Atlantic Salmon';
  if (n.includes('chinook') || n.includes('king salmon')) return 'Chinook Salmon';
  if (n.includes('pink salmon')) return 'Pink Salmon';
  if (n.includes('chum') || n.includes('keta')) return 'Chum Salmon';
  if (n.includes('halibut') && n.includes('atlantic')) return 'Atlantic Halibut';
  if (n.includes('halibut') && n.includes('pacific')) return 'Pacific Halibut';
  if (n.includes('albacore')) return 'Albacore Tuna';
  if (n.includes('skipjack')) return 'Skipjack Tuna';
  if (n.includes('yellowfin')) return 'Yellowfin Tuna';
  if (n.includes('atlantic cod')) return 'Atlantic Cod';
  if (n.includes('pacific cod')) return 'Pacific Cod';
  
  // If it's just "cod" or "halibut" without specifics, leave it broad for the database search to find all candidates
  if (n === 'cod') return 'Cod';
  if (n === 'halibut') return 'Halibut';
  
  // Fallback to title case
  return n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

export const normalizeCountry = (name: string) => {
  if (!name || name === 'Unknown') return 'Unknown';
  let n = name.toLowerCase().trim();
  
  // Support mixed code/name formats: "Norway, FAO 27" -> "Norway"
  if (n.includes(',')) n = n.split(',')[0].trim();
  if (n.includes('|')) n = n.split('|')[0].trim();
  if (n.includes('/')) n = n.split('/')[0].trim();

  // Map to "United States" to match authoritative list
  if (n === 'u.s.' || n === 'usa' || n === 'united states' || n === 'united states of america' || n === 'u.s.a.' || n.includes('united states')) return 'United States';
  if (n === 'viet nam' || n === 'vietnam' || n.includes('vietnam')) return 'Vietnam';
  if (n === 'russia' || n === 'russian federation' || n.includes('russia')) return 'Russia';
  if (n === 'korea' || n === 'south korea' || n === 'republic of korea' || n.includes('korea')) return 'South Korea';
  if (n.includes('new zealand')) return 'New Zealand';
  if (n.includes('iceland')) return 'Iceland';
  if (n.includes('mexico')) return 'Mexico';
  
  // Capitalize first letter of each word as fallback
  return n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

export const normalizeMethod = (method: string) => {
  if (!method || method === 'Unknown' || method === 'N/A') return 'Unknown';
  const m = method.toLowerCase().trim();
  
  if (m.includes('ras') || m.includes('recirculating') || m.includes('recirculatory')) return 'Indoor Recirculating Tanks';
  if (m.includes('net pen') || (m.includes('pen') && m.includes('marine'))) return 'Marine Net Pens';
  if (m.includes('trap') || m.includes('pot') || m.includes('creel') || m.includes('cage')) return 'Traps/Pots';
  if (m.includes('gillnet') || m.includes('fixed net') || m.includes('drift net')) return 'Gillnets';
  if (m.includes('dive') || m.includes('diving') || m.includes('hand') || m.includes('scuba')) return 'Diving';
  if (m.includes('line') || m.includes('troll') || m.includes('pole')) return 'Lines';
  if (m.includes('seine') || m.includes('surround')) return 'Surround Nets';
  if (m.includes('trawl')) return 'Trawls';
  if (m.includes('pond') || m.includes('raceway')) return 'Ponds';
  if (m.includes('suripera')) return 'Suripera';
  
  return method.trim();
};
