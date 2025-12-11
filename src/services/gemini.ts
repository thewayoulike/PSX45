import { GoogleGenAI, Type } from "@google/genai";
import { ParsedTrade, DividendAnnouncement } from '../types';
import * as XLSX from 'xlsx';

// --- CONFIGURATION ---
// We will try these models in order. If one fails (404 or 503), we move to the next.
const MODEL_FALLBACKS = [
    "gemini-1.5-flash",       // Standard alias (Fastest)
    "gemini-1.5-flash-002",   // Specific stable version
    "gemini-1.5-flash-8b",    // Ultra-light version
    "gemini-1.5-pro",         // More powerful (Slower)
    "gemini-2.0-flash-exp"    // Experimental (Newest)
];

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

// --- MAIN PARSE FUNCTION WITH RETRY LOGIC ---
export const parseTradeDocument = async (file: File): Promise<ParsedTrade[]> => {
  const ai = getAi(); 
  if (!ai) throw new Error("API Key missing. Please set your Gemini API Key in Settings.");

  try {
    const isSpreadsheet = file.name.match(/\.(csv|xlsx|xls)$/i);
    let parts: any[] = [];

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

    // --- FALLBACK LOOP ---
    let lastError: any;

    for (const modelName of MODEL_FALLBACKS) {
        try {
            console.log(`Scanning with model: ${modelName}...`);
            
            const response = await ai.models.generateContent({
              model: modelName,
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

            if (response.text) {
                return JSON.parse(response.text);
            }
            throw new Error("Empty response received from AI");

        } catch (error: any) {
            console.warn(`Model ${modelName} failed: ${error.message}`);
            lastError = error;
            
            // Check if we should retry with next model
            const isRetryable = 
                error.message?.includes('404') || 
                error.message?.includes('503') || 
                error.message?.includes('overloaded') ||
                error.message?.includes('not found');

            if (!isRetryable) {
                // If it's a file format error or API key error, don't try other models
                throw error;
            }
            
            // Short delay before next model
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }

    // If all models fail
    throw lastError || new Error("Failed to scan document. All AI models are currently busy or unavailable.");

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
        
        // Also use fallback logic for dividends to be safe
        for (const modelName of MODEL_FALLBACKS) {
            try {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: `Find all dividend announcements declared in the LAST ${months} MONTHS for these Pakistan Stock Exchange (PSX) tickers: ${tickerList}.
                    Return ONLY a raw JSON array (no markdown) with objects:
                    [{ "ticker": "ABC", "amount": 5.5, "exDate": "YYYY-MM-DD", "payoutDate": "YYYY-MM-DD", "type": "Interim", "period": "1st Quarter" }]
                    
                    Ignore any dividends older than ${months} months.`,
                    config: {
                        tools: [{ googleSearch: {} }]
                    }
                });

                const text = response.text;
                if (!text) continue; 

                const jsonString = extractJsonArray(text);
                if (jsonString) {
                    return JSON.parse(jsonString);
                }
            } catch (e) {
                console.warn(`Dividend fetch failed on ${modelName}`, e);
                // Continue to next model
            }
        }
        return [];
    } catch (error) {
        console.error("Error fetching dividends:", error);
        throw error; 
    }
}
