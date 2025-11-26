// 1. Hardcoded Sector Codes (The "Master List" from PSX)
export const SECTOR_CODE_MAP: Record<string, string> = {
  '0801': 'Automobile Assembler',
  '0802': 'Automobile Parts & Accessories',
  '0803': 'Cable & Electrical Goods',
  '0804': 'Cement',
  '0805': 'Chemical',
  '0806': 'Close - End Mutual Fund',
  '0807': 'Commercial Banks',
  '0808': 'Engineering',
  '0809': 'Fertilizer',
  '0810': 'Food & Personal Care Products',
  '0811': 'Glass & Ceramics',
  '0812': 'Insurance',
  '0813': 'Inv. Banks / Inv. Cos. / Securities Cos.',
  '0814': 'Jute',
  '0815': 'Leasing Companies',
  '0816': 'Leather & Tanneries',
  '0818': 'Miscellaneous',
  '0819': 'Modarabas',
  '0820': 'Oil & Gas Exploration Companies',
  '0821': 'Oil & Gas Marketing Companies',
  '0822': 'Paper, Board & Packaging',
  '0823': 'Pharmaceuticals',
  '0824': 'Power Generation & Distribution',
  '0825': 'Refinery',
  '0826': 'Sugar & Allied Industries',
  '0827': 'Synthetic & Rayon',
  '0828': 'Technology & Communication',
  '0829': 'Textile Composite',
  '0830': 'Textile Spinning',
  '0831': 'Textile Weaving',
  '0832': 'Tobacco',
  '0833': 'Transport',
  '0834': 'Vanaspati & Allied Industries',
  '0835': 'Woollen',
  '0836': 'Real Estate Investment Trust',
  '0837': 'Exchange Traded Funds',
  '0838': 'Property'
};

// 2. Static Ticker Map (Fallback for when sync hasn't run yet)
export const SECTOR_MAP: Record<string, string> = {
  // Commercial Banks
  'HBL': 'Commercial Banks', 'MCB': 'Commercial Banks', 'UBL': 'Commercial Banks', 
  'MEBL': 'Commercial Banks', 'BAHL': 'Commercial Banks', 'BAFL': 'Commercial Banks', 
  'AKBL': 'Commercial Banks', 'FABL': 'Commercial Banks', 'BOP': 'Commercial Banks',
  'HMB': 'Commercial Banks', 'JSBL': 'Commercial Banks', 'SNBL': 'Commercial Banks',
  'BIPL': 'Commercial Banks', 'BOK': 'Commercial Banks', 'SBL': 'Commercial Banks',
  'SILK': 'Commercial Banks',

  // Oil & Gas Exploration
  'OGDC': 'Oil & Gas Exploration', 'PPL': 'Oil & Gas Exploration', 
  'MARI': 'Oil & Gas Exploration', 'POL': 'Oil & Gas Exploration',
  'OJU': 'Oil & Gas Exploration',

  // Oil & Gas Marketing
  'PSO': 'Oil & Gas Marketing', 'SNGP': 'Oil & Gas Marketing', 
  'SSGC': 'Oil & Gas Marketing', 'SHEL': 'Oil & Gas Marketing', 
  'APL': 'Oil & Gas Marketing', 'HASCOL': 'Oil & Gas Marketing',
  'HTL': 'Oil & Gas Marketing',

  // Technology & Communication
  'SYS': 'Technology & Comm', 'TRG': 'Technology & Comm', 'AVN': 'Technology & Comm', 
  'NETSOL': 'Technology & Comm', 'AIRLINK': 'Technology & Comm', 'PTC': 'Technology & Comm',
  'OCTOPUS': 'Technology & Comm', 'HUMNL': 'Technology & Comm', 'TELE': 'Technology & Comm',
  'WTL': 'Technology & Comm', 'SYM': 'Technology & Comm',

  // Fertilizer
  'EFERT': 'Fertilizer', 'ENGRO': 'Fertilizer', 'FFC': 'Fertilizer', 
  'FATIMA': 'Fertilizer', 'FFBL': 'Fertilizer', 'AHCL': 'Fertilizer',

  // Cement
  'LUCK': 'Cement', 'DGKC': 'Cement', 'MLCF': 'Cement', 'CHCC': 'Cement', 
  'FCCL': 'Cement', 'KOHC': 'Cement', 'PIOC': 'Cement', 'BWCL': 'Cement',
  'DCL': 'Cement', 'POWER': 'Cement', 'ACPL': 'Cement',
  'GWLC': 'Cement',

  // Power Generation & Distribution
  'HUBC': 'Power Generation', 'KAPCO': 'Power Generation', 'NCPL': 'Power Generation', 
  'NPL': 'Power Generation', 'LPL': 'Power Generation', 'PKGP': 'Power Generation', 
  'KEL': 'Power Generation', 'SPWL': 'Power Generation', 'EPQL': 'Power Generation',
  'TSPL': 'Power Generation', 'ALTN': 'Power Generation',

  // Refinery
  'ATRL': 'Refinery', 'NRL': 'Refinery', 'PRL': 'Refinery', 'CNERGY': 'Refinery',

  // Automobile Assembler
  'INDU': 'Automobile Assembler', 'HCAR': 'Automobile Assembler', 
  'PSMC': 'Automobile Assembler', 'MTL': 'Automobile Assembler', 
  'GHNI': 'Automobile Assembler', 'SAZEW': 'Automobile Assembler',
  'AGTL': 'Automobile Assembler',

  // Automobile Parts & Accessories
  'THALL': 'Automobile Parts', 'AGIL': 'Automobile Parts', 'EXIDE': 'Automobile Parts',
  'GTYR': 'Automobile Parts', 'LOADS': 'Automobile Parts', 'BWHL': 'Automobile Parts',

  // Pharmaceuticals
  'SEARL': 'Pharmaceuticals', 'ABOT': 'Pharmaceuticals', 'GLAXO': 'Pharmaceuticals', 
  'HALEON': 'Pharmaceuticals', 'AGP': 'Pharmaceuticals', 'IBLHL': 'Pharmaceuticals',
  'FEROZ': 'Pharmaceuticals', 'HIGH': 'Pharmaceuticals', 'CPHL': 'Pharmaceuticals',
  'BFBIO': 'Pharmaceuticals',

  // Chemicals
  'EPCL': 'Chemicals', 'LOTCHEM': 'Chemicals', 'COLG': 'Chemicals', 
  'DOL': 'Chemicals', 'SITC': 'Chemicals', 'ICI': 'Chemicals',
  'ARPL': 'Chemicals', 'BIM': 'Chemicals', 'GGL': 'Chemicals',

  // Food & Personal Care
  'UNITY': 'Food & Personal Care', 'PREMA': 'Food & Personal Care', 
  'NESTLE': 'Food & Personal Care', 'NATF': 'Food & Personal Care', 
  'FCEPL': 'Food & Personal Care', 'TREET': 'Food & Personal Care',
  'BUNNY': 'Food & Personal Care', 'MUBT': 'Food & Personal Care',
  'RMPL': 'Food & Personal Care', 'UPFL': 'Food & Personal Care',
  'ZIL': 'Food & Personal Care',

  // Textile Composite
  'ILP': 'Textile Composite', 'NML': 'Textile Composite', 'GATM': 'Textile Composite', 
  'KTML': 'Textile Composite', 'FML': 'Textile Composite', 'ATM': 'Textile Composite',
  'AZG': 'Textile Composite', 'BTL': 'Textile Composite', 'CRTM': 'Textile Composite',
  'GADT': 'Textile Composite', 'IDYM': 'Textile Composite',

  // Textile Spinning
  'CASH': 'Textile Spinning', 'DWSM': 'Textile Spinning', 'GTECH': 'Textile Spinning',
  'KOHE': 'Textile Spinning', 'NATM': 'Textile Spinning', 'SAPT': 'Textile Spinning',

  // Textile Weaving
  'SHDT': 'Textile Weaving', 'YKTM': 'Textile Weaving', 'ZELP': 'Textile Weaving',

  // Engineering
  'ISL': 'Engineering', 'INIL': 'Engineering', 'MUGHAL': 'Engineering', 
  'ASTL': 'Engineering', 'CSAP': 'Engineering', 'AGL': 'Engineering',
  'ASL': 'Engineering', 'ITTEFAQ': 'Engineering',

  // Cable & Electrical Goods
  'PAEL': 'Cable & Elec Goods', 'TPL': 'Cable & Elec Goods', 'WAVES': 'Cable & Elec Goods',
  'EMCO': 'Cable & Elec Goods',

  // Glass & Ceramics
  'TGL': 'Glass & Ceramics', 'STCL': 'Glass & Ceramics', 'GHGL': 'Glass & Ceramics',
  'KHTC': 'Glass & Ceramics', 'FVCL': 'Glass & Ceramics',

  // Paper & Board
  'PKGS': 'Paper & Board', 'CPPL': 'Paper & Board', 'CEPB': 'Paper & Board',
  'PPP': 'Paper & Board', 'RPL': 'Paper & Board', 'SEPL': 'Paper & Board',

  // Leather & Tanneries
  'SRVI': 'Leather & Tanneries', 'BATA': 'Leather & Tanneries', 'LEUL': 'Leather & Tanneries',

  // Sugar & Allied
  'ADAMS': 'Sugar & Allied', 'ALNRS': 'Sugar & Allied', 'HABSM': 'Sugar & Allied',
  'JSML': 'Sugar & Allied', 'MRNS': 'Sugar & Allied', 'SHSML': 'Sugar & Allied',

  // Insurance
  'AICL': 'Insurance', 'EFUG': 'Insurance', 'EFUL': 'Insurance', 'IGIHL': 'Insurance',
  'JGICL': 'Insurance', 'PAKL': 'Insurance',

  // Investment Banks / Inv. Cos / Securities
  'DAWH': 'Inv. Banks / Securities', 'FNEL': 'Inv. Banks / Securities', 
  'IST': 'Inv. Banks / Securities', 'JSGCL': 'Inv. Banks / Securities',
  'KASB': 'Inv. Banks / Securities', 'NEXT': 'Inv. Banks / Securities',

  // Modarabas
  'OLPL': 'Modaraba', 'FHAM': 'Modaraba', 'IBL': 'Modaraba',

  // Real Estate Investment Trust (REIT)
  'DCR': 'REIT', 'GRR': 'REIT',

  // Transport
  'PIAA': 'Transport', 'PIAB': 'Transport', 'PNSC': 'Transport',

  // Vanaspati & Allied
  'PPO': 'Vanaspati & Allied',

  // Woollen
  'BNWM': 'Woollen',

  // Miscellaneous
  'PSEL': 'Miscellaneous', 'PACE': 'Miscellaneous', 'SGF': 'Miscellaneous',
  'SHFA': 'Miscellaneous', 'ECOP': 'Miscellaneous',
};

export const getSector = (ticker: string): string => {
  return SECTOR_MAP[ticker.toUpperCase()] || 'Other / Misc';
};
