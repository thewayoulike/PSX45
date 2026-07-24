// src/services/indices.ts
// KSE-100 and KMI-30 constituent lists used to filter the market scan.
//
// NOTE: PSX rebalances these indices roughly twice a year. These lists are a
// best-effort snapshot — update them after each rebalance. A symbol listed here
// that isn't currently trading simply won't match; a real constituent missing
// from the list won't be scanned. You can copy the official recomposition from
// psx.com.pk and paste the symbols below.

export const KMI30: string[] = [
  'MEBL', 'OGDC', 'PPL', 'POL', 'MARI', 'HUBC', 'ENGRO', 'EFERT', 'FFC', 'LUCK',
  'DGKC', 'MLCF', 'PIOC', 'FCCL', 'KOHC', 'SYS', 'TRG', 'NETSOL', 'COLG', 'NESTLE',
  'ICI', 'SEARL', 'ABOT', 'EPCL', 'THALL', 'INDU', 'MTL', 'GHGL', 'NML', 'ATRL',
];

export const KSE100: string[] = [
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

export const KSE100_SET = new Set(KSE100);
export const KMI30_SET = new Set(KMI30);
