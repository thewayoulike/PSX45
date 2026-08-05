import { GoogleGenAI, Type } from "@google/genai";
import { ParsedTrade, DividendAnnouncement } from '../types';
import * as XLSX from 'xlsx';

let userProvidedKey: string | null = null;
let aiClient: GoogleGenAI | null = null;

const sanitizeKey = (key: string): string => {
    return key.replace(/[^\x00-\x7F]/g, "").trim();
};

export const setGeminiApiKey = (key: string | null) => {
    userProvidedKey = key ? sanitizeKey(key) : null;
    aiClient = null;
};

const getApiKey = () => userProvidedKey;

const getAi = (): GoogleGenAI | null => {
    if (aiClient) return aiClient;
    const key = getApiKey();
    if (!key) return null;
    try {
        aiClient = new GoogleGenAI({ apiKey: key });
        return aiClient;
    } catch (e) {
        console.error("Failed to initialize Gemini Client", e);
        return null;
    }
}

const readSpreadsheetAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) return reject("Empty file");
                if (file.name.toLowerCase().endsWith('.csv')) {
                    resolve(data as string);
                } else {
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const csvText = XLSX.utils.sheet_to_csv(worksheet);
                    resolve(csvText);
                }
            } catch (err) {
                reject("Failed to parse spreadsheet: " + err);
            }
        };
        reader.onerror = (err) => reject(err);
        if (file.name.toLowerCase().endsWith('.csv')) {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    });
};

// Robust JSON Extraction
const extractJsonArray = (text: string): string | null => {
    const startIndex = text.indexOf('[');
    if (startIndex === -1) return null;
    let bracketCount = 0;
    let inString = false;
    let escape = false;
    for (let i = startIndex; i < text.length; i++) {
        const char = text[i];
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (!inString) {
            if (char === '[') bracketCount++;
            else if (char === ']') {
                bracketCount--;
                if (bracketCount === 0) return text.substring(startIndex, i + 1);
            }
        }
    }
    return null;
};

export const parseTradeDocument = async (file: File): Promise<ParsedTrade[]> => {
  try {
    const ai = getAi(); 
    if (!ai) throw new Error("API Key missing. Please set your Gemini API Key in Settings.");

    const isSpreadsheet = file.name.match(/\.(csv|xlsx|xls)$/i);
    let parts: any[] = [];

    // Prompt instructions with explicit Fee Summing logic
    const promptText = `Analyze this trade confirmation document/data. Extract all trade executions. 
    
    CRITICAL INSTRUCTIONS:
    1. **Dates**: Look for the trade/execution date. Normalize ALL dates to 'YYYY-MM-DD' format (ISO 8601). 
       - Support formats like "01-JAN-2024", "01/01/2024", "Jan 1, 2024", "15-12-2024".
       - If multiple dates exist (e.g. Trade Date vs Settlement Date), ALWAYS use the **TRADE DATE**.
    2. **Fees Breakdown**:
       - **Commission**: Extract the trading commission/brokerage.
       - **Tax**: Extract SST (Sindh Sales Tax), WHT, or CVT.
       - **CDC Charges**: Extract CDC or Custody fees.
       - **Other Fees**: Look for ANY other charges (e.g. FED, Regulatory Fee, NCPL Fee, Service Charges). **SUM THEM ALL UP** and put the total in the 'otherFees' field. Do NOT include commission, tax, or CDC in this sum.
    3. **Output**: Return a JSON array of objects.`;

    if (isSpreadsheet) {
        const sheetData = await readSpreadsheetAsText(file);
        parts = [
            { text: "Here is the raw data from a trade history spreadsheet:" },
            { text: sheetData },
            { text: promptText }
        ];
    } else {
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        parts = [
            { inlineData: { mimeType: file.type, data: base64Data } },
            { text: promptText }
        ];
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              ticker: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["BUY", "SELL"] },
              quantity: { type: Type.NUMBER },
              price: { type: Type.NUMBER },
              date: { type: Type.STRING, description: "YYYY-MM-DD format" },
              broker: { type: Type.STRING, nullable: true },
              commission: { type: Type.NUMBER, nullable: true },
              tax: { type: Type.NUMBER, nullable: true },
              cdcCharges: { type: Type.NUMBER, nullable: true },
              otherFees: { type: Type.NUMBER, nullable: true, description: "Sum of FED, Reg Fee, etc." }
            },
            required: ["ticker", "type", "quantity", "price", "date"]
          }
        }
      }
    });

    if (response.text) return JSON.parse(response.text);
    return [];
  } catch (error: any) {
    console.error("Error parsing document:", error);
    throw new Error(error.message || "Failed to scan document.");
  }
};

// ---------------------------------------------------------------------------
// AI PORTFOLIO REVIEW
// Sends a compact, anonymous snapshot of the portfolio (no names, no account
// numbers — only tickers, weights and percentages) and asks Gemini for an
// educational review. Output is structured JSON so the UI can render it safely.
// ---------------------------------------------------------------------------

export interface AiReviewPoint {
  title: string;
  detail: string;
}

export interface AiReviewRisk extends AiReviewPoint {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface AiPortfolioReview {
  headline: string;
  summary: string;
  strengths: AiReviewPoint[];
  risks: AiReviewRisk[];
  ideas: AiReviewPoint[];
  diversification: string;
  generatedAt: string;
}

export interface AiPortfolioSnapshot {
  totalValue: number;
  totalCost: number;
  unrealizedPLPercent: number;
  realizedPL: number;
  totalDividends: number;
  totalFees: number;
  freeCash: number;
  cashPercent: number;
  winRate: number | null;
  closedTrades: number;
  holdings: {
    ticker: string;
    sector: string;
    weightPercent: number;
    plPercent: number;
  }[];
  sectors: { sector: string; weightPercent: number }[];
}

export const analyzePortfolio = async (snap: AiPortfolioSnapshot): Promise<AiPortfolioReview> => {
  const ai = getAi();
  if (!ai) throw new Error("API Key missing. Please go to Settings → API Keys to add one.");

  const n = (v: number) => Number(v || 0).toFixed(2);

  const holdingLines = snap.holdings
    .map(h => `- ${h.ticker} (${h.sector}): ${n(h.weightPercent)}% of portfolio, currently ${n(h.plPercent)}% P&L`)
    .join('\n');
  const sectorLines = snap.sectors
    .map(s => `- ${s.sector}: ${n(s.weightPercent)}%`)
    .join('\n');

  const prompt = `You are an experienced equity portfolio analyst reviewing a retail investor's
Pakistan Stock Exchange (PSX) portfolio. Give a clear, educational review in plain English.

PORTFOLIO SNAPSHOT
Total market value: PKR ${n(snap.totalValue)}
Total invested (cost basis): PKR ${n(snap.totalCost)}
Unrealized return: ${n(snap.unrealizedPLPercent)}%
Realized P&L to date: PKR ${n(snap.realizedPL)}
Dividends received: PKR ${n(snap.totalDividends)}
Fees & taxes paid: PKR ${n(snap.totalFees)}
Idle cash: PKR ${n(snap.freeCash)} (${n(snap.cashPercent)}% of net worth)
Closed trades: ${snap.closedTrades}${snap.winRate != null ? `, win rate ${n(snap.winRate)}%` : ''}

HOLDINGS (${snap.holdings.length})
${holdingLines || '- none'}

SECTOR EXPOSURE
${sectorLines || '- none'}

INSTRUCTIONS
- Be specific and quantitative: name actual tickers and cite the real percentages above.
- Focus on portfolio construction: concentration, sector balance, position sizing, cash drag,
  fee efficiency, and the spread between realized and unrealized performance.
- "risks" must be ranked with severity HIGH/MEDIUM/LOW, most serious first.
- "ideas" are things the investor could consider researching or reviewing — frame them as
  questions or areas to examine, NOT as buy/sell instructions or price targets.
- Do NOT predict prices, do NOT promise returns, and do NOT tell the user to buy or sell
  any specific stock. This is educational analysis, not investment advice.
- Keep every "detail" to 1-2 sentences. Aim for 2-4 strengths, 2-4 risks, 2-4 ideas.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING, description: "One punchy sentence summarising the portfolio's state" },
            summary: { type: Type.STRING, description: "2-3 sentence overview" },
            diversification: { type: Type.STRING, description: "One or two sentences on how well spread the portfolio is" },
            strengths: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { title: { type: Type.STRING }, detail: { type: Type.STRING } },
                required: ["title", "detail"]
              }
            },
            risks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  detail: { type: Type.STRING },
                  severity: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] }
                },
                required: ["title", "detail", "severity"]
              }
            },
            ideas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { title: { type: Type.STRING }, detail: { type: Type.STRING } },
                required: ["title", "detail"]
              }
            }
          },
          required: ["headline", "summary", "strengths", "risks", "ideas", "diversification"]
        }
      }
    });

    if (!response.text) throw new Error("Empty response from AI.");
    const parsed = JSON.parse(response.text);
    return {
      headline: parsed.headline || 'Portfolio review',
      summary: parsed.summary || '',
      diversification: parsed.diversification || '',
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      ideas: Array.isArray(parsed.ideas) ? parsed.ideas : [],
      generatedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error("AI portfolio review failed:", error);
    throw new Error(error?.message || "Failed to generate review.");
  }
};

// ---------------------------------------------------------------------------
// BALANCE-SHEET FUNDAMENTALS VIA SEARCH
// The PSX company page only publishes Sales, Profit after Taxation and EPS —
// it has NO balance-sheet rows. So book value, equity, liabilities, current
// assets/liabilities, inventory and free cash flow can never be scraped there.
// This uses Gemini with Google Search grounding to pull those figures from
// other public sources (scstrade, annual reports, broker research, etc.).
// ---------------------------------------------------------------------------

export interface BalanceSheetYear {
  period: string;              // e.g. "2024" or "FY2024"
  bookValuePerShare?: string;
  totalEquity?: string;
  totalLiabilities?: string;
  totalAssets?: string;
  currentAssets?: string;
  currentLiabilities?: string;
  inventory?: string;
  freeCashFlow?: string;
  sales?: string;
  source?: string;             // where the figure came from
}

export const fetchBalanceSheetViaSearch = async (
  symbol: string,
  companyName?: string
): Promise<BalanceSheetYear[]> => {
  const ai = getAi();
  if (!ai) throw new Error("API Key missing.");

  const who = companyName ? `${companyName} (PSX: ${symbol})` : `PSX-listed company with ticker ${symbol}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Find the most recent audited balance sheet and cash-flow figures for ${who},
listed on the Pakistan Stock Exchange.

Search sources such as scstrade.com, the company's own annual report / investor relations page,
Capital Stake, and Pakistani broker research. Cross-check where possible.

Return ONLY a raw JSON array (no markdown fences) covering the last 2-3 fiscal years, newest first:
[{
  "period": "2024",
  "sales": "123,456",
  "bookValuePerShare": "85.20",
  "totalEquity": "45,000,000",
  "totalLiabilities": "22,000,000",
  "totalAssets": "67,000,000",
  "currentAssets": "30,000,000",
  "currentLiabilities": "18,000,000",
  "inventory": "9,000,000",
  "freeCashFlow": "4,500,000",
  "source": "scstrade.com"
}]

RULES
- State units consistently: report rupee amounts in THOUSANDS (000's), like PSX does, and say so in "source" if the source used a different unit.
- bookValuePerShare is per share in PKR (break-up value), not in thousands.
- OMIT any field you cannot verify — do NOT guess, estimate or fabricate a number.
- If you cannot find reliable data at all, return an empty array [].
- Always fill "source" with the site or document the figures came from.`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const text = response.text;
  if (!text) return [];
  const jsonString = extractJsonArray(text);
  if (!jsonString) return [];
  try {
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const fetchDividends = async (tickers: string[], months: number = 6): Promise<DividendAnnouncement[]> => {
    try {
        const ai = getAi(); 
        if (!ai) throw new Error("API Key missing. Please go to Settings to add one.");

        const tickerList = tickers.join(", ");
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Find all dividend announcements declared in the LAST ${months} MONTHS for these Pakistan Stock Exchange (PSX) tickers: ${tickerList}.
            Return ONLY a raw JSON array (no markdown) with objects:
            [{ "ticker": "ABC", "amount": 5.5, "exDate": "YYYY-MM-DD", "payoutDate": "YYYY-MM-DD", "type": "Interim", "period": "1st Quarter" }]

            IMPORTANT: "amount" must be the ACTUAL cash dividend in RUPEES PER SHARE (DPS), not the declared percentage.
            PSX dividends are declared as a percentage of FACE VALUE. Most PSX stocks have a Rs. 10 face value
            (so 100% = Rs. 10.00/share), but some have a lower face value — e.g. Rs. 5 (100% = Rs. 5.00),
            Rs. 3.5 (K-Electric/KEL, 100% = Rs. 3.50), or Rs. 1 (100% = Rs. 1.00). Convert to the correct
            rupee amount using that stock's real face value before returning it.

            Ignore any dividends older than ${months} months.`,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const text = response.text;
        if (!text) return [];

        const jsonString = extractJsonArray(text);
        if (jsonString) {
            try {
                return JSON.parse(jsonString);
            } catch (e) {
                console.error("JSON Parse Error:", e, "Raw Text:", text);
                return [];
            }
        }
        return [];
    } catch (error) {
        console.error("Error fetching dividends:", error);
        throw error; 
    }
}
