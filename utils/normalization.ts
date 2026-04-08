
export const normalizeSpecies = (name: string) => {
  if (!name || name === 'Unknown') return 'Unknown';
  const n = name.toLowerCase().trim();
  if (n.includes('coho')) return 'Coho Salmon';
  if (n.includes('sockeye')) return 'Sockeye Salmon';
  if (n.includes('atlantic salmon')) return 'Atlantic Salmon';
  if (n.includes('chinook') || n.includes('king salmon')) return 'Chinook Salmon';
  if (n.includes('pink salmon')) return 'Pink Salmon';
  if (n.includes('chum') || n.includes('keta')) return 'Chum Salmon';
  if (n.includes('halibut')) return 'Halibut';
  if (n.includes('albacore')) return 'Albacore Tuna';
  if (n.includes('skipjack')) return 'Skipjack Tuna';
  if (n.includes('yellowfin')) return 'Yellowfin Tuna';
  if (n.includes('cod')) return 'Cod';
  // Capitalize first letter of each word as fallback
  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

export const normalizeCountry = (name: string) => {
  if (!name || name === 'Unknown') return 'Unknown';
  const n = name.toLowerCase().trim();
  if (n === 'u.s.' || n === 'usa' || n === 'united states' || n === 'united states of america' || n === 'u.s.a.') return 'USA';
  if (n === 'viet nam' || n === 'vietnam') return 'Vietnam';
  if (n === 'russia' || n === 'russian federation') return 'Russia';
  if (n === 'korea' || n === 'south korea' || n === 'republic of korea') return 'South Korea';
  // Capitalize first letter of each word as fallback
  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

export const normalizeMethod = (method: string) => {
  if (!method || method === 'Unknown' || method === 'N/A') return 'Unknown';
  const m = method.toLowerCase().trim();
  
  if (m.includes('trap') || m.includes('pot') || m.includes('creel') || m.includes('cage')) return 'Traps/Pots';
  if (m.includes('gillnet') || m.includes('fixed net') || m.includes('drift net')) return 'Gillnets';
  if (m.includes('dive') || m.includes('diving') || m.includes('hand') || m.includes('scuba')) return 'Diving';
  if (m.includes('line') || m.includes('troll') || m.includes('pole')) return 'Lines';
  if (m.includes('seine') || m.includes('surround')) return 'Surround Nets';
  if (m.includes('trawl')) return 'Trawls';
  if (m.includes('pen') || m.includes('cage') || m.includes('net pen')) return 'Marine Net Pens';
  if (m.includes('pond') || m.includes('raceway')) return 'Ponds';
  if (m.includes('suripera')) return 'Suripera';
  
  return method.trim();
};
