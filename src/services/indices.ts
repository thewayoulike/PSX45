// src/services/indices.ts
// KSE-100 and KMI-30 constituent lists used to filter the market scan.
//
// Hardcoded lists are the fallback. Sync can refresh them via
// pypsx.get_index_symbols (packaged in the wheel — no API key).

export let KMI30: string[] = [
  'MEBL', 'OGDC', 'PPL', 'POL', 'MARI', 'HUBC', 'ENGRO', 'EFERT', 'FFC', 'LUCK',
  'DGKC', 'MLCF', 'PIOC', 'FCCL', 'KOHC', 'SYS', 'TRG', 'NETSOL', 'COLG', 'NESTLE',
  'ICI', 'SEARL', 'ABOT', 'EPCL', 'THALL', 'INDU', 'MTL', 'GHGL', 'NML', 'ATRL',
];

export let KSE100: string[] = [
  // Banks
  'HBL', 'UBL', 'MCB', 'NBP', 'BAHL', 'BAFL', 'MEBL', 'AKBL', 'BOP', 'FABL', 'ABL', 'BIPL', 'HMB', 'JSBL', 'SNBL',
  // Oil & Gas
  'OGDC', 'PPL', 'POL', 'MARI', 'PSO', 'APL', 'SHEL', 'HTL', 'ATRL', 'NRL', 'PRL', 'CNERGY', 'SNGP', 'SSGC',
  // Fertilizer
  'ENGRO', 'EFERT', 'FFC', 'FFBL', 'FATIMA', 'AGL',
  // Chemicals / Polymer
  'EPCL', 'ICI', 'COLG', 'BERGER', 'ARPL',
  // Cement
  'LUCK', 'DGKC', 'MLCF', 'PIOC', 'FCCL', 'KOHC', 'CHCC', 'ACPL', 'GWLC', 'BWCL', 'POWER', 'FLYNG',
  // Power
  'HUBC', 'KEL', 'NPL', 'NCPL', 'KAPCO',
  // Technology
  'SYS', 'TRG', 'NETSOL', 'AVN', 'OCTOPUS',
  // Autos
  'INDU', 'MTL', 'PSMC', 'HCAR', 'ATLH', 'THALL', 'GHNI',
  // Pharma
  'SEARL', 'ABOT', 'HINOON', 'GLAXO', 'AGP', 'HALEON', 'CPHL',
  // Textile
  'NML', 'NCL', 'ILP', 'KTML', 'GATM', 'FML',
  // Food
  'NESTLE', 'UNITY', 'NATF', 'FFL', 'TREET', 'MFFL',
  // Steel / Engineering
  'ISL', 'ASTL', 'MUGHAL', 'INIL', 'AICL',
  // Misc
  'PKGS', 'PAEL', 'PIBTL', 'PICT', 'GHGL', 'DAWH', 'FEROZ', 'JDWS',
];

export let KSE100_SET = new Set(KSE100);
export let KMI30_SET = new Set(KMI30);

/** Replace in-memory constituent lists when pyPSX returns a non-empty universe. */
export function applyIndexConstituents(payload: { KSE100?: string[]; KMI30?: string[] } | null | undefined) {
  if (!payload) return;
  if (Array.isArray(payload.KSE100) && payload.KSE100.length >= 50) {
    KSE100 = payload.KSE100.map((s) => String(s).toUpperCase().trim()).filter(Boolean);
    KSE100_SET = new Set(KSE100);
  }
  if (Array.isArray(payload.KMI30) && payload.KMI30.length >= 20) {
    KMI30 = payload.KMI30.map((s) => String(s).toUpperCase().trim()).filter(Boolean);
    KMI30_SET = new Set(KMI30);
  }
}
