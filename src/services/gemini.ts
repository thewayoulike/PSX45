import { GoogleGenAI, Type } from "@google/genai";
import { ParsedTrade, DividendAnnouncement, FundamentalsData } from '../types';
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

// --- NEW FUNCTION: Financial Analysis ---
export const getFinancialAnalysis = async (ticker: string, data: FundamentalsData): Promise<string> => {
  try {
    const ai = getAi();
    if (!ai) return "AI Key missing. Please check Settings.";

    // Prepare a summary of the data to save tokens
    const recentAnnual = data.annual.financials.slice(0, 3); // Last 3 years
    const recentQuarter = data.quarterly.financials.slice(0, 2); // Last 2 quarters
    
    const prompt = `
      Act as a senior stock market analyst for the Pakistan Stock Exchange (PSX).
      Analyze the following financial data for **${ticker}**.
      
      **Recent Annual Performance:**
      ${JSON.stringify(recentAnnual)}
      
      **Recent Quarterly Performance:**
      ${JSON.stringify(recentQuarter)}
      
      **Ratios:**
      ${JSON.stringify(data.annual.ratios.slice(0, 2))}

      Provide a concise 3-4 sentence summary covering:
      1. Growth trend (Sales/Profit).
      2. Valuation attractiveness (based on EPS).
      3. A sentiment rating (Bullish, Bearish, or Neutral) with a brief reason.
      
      Keep it professional and data-driven.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
    });

    return response.text || "Could not generate analysis.";
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return "AI Service is currently unavailable.";
  }
};
