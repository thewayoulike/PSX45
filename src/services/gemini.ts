import { GoogleGenAI, Type } from "@google/genai";
import { ParsedTrade, DividendAnnouncement } from '../types';
import * as XLSX from 'xlsx';

// 1. Store the user's key in memory
let userProvidedKey: string | null = null;
let aiClient: GoogleGenAI | null = null;

export const setGeminiApiKey = (key: string | null) => {
    userProvidedKey = key;
    aiClient = null;
};

// 2. STRICT USER-ONLY KEY ACCESS
const getApiKey = () => {
  return userProvidedKey;
};

// 3. LAZY INITIALIZATION
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

// --- HELPER: Read Spreadsheet to Text ---
const readSpreadsheetAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) return reject("Empty file");

                if (file.name.toLowerCase().endsWith('.csv')) {
                    // CSV is already text
                    resolve(data as string);
                } else {
                    // Parse Excel (XLSX/XLS)
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    // Convert to CSV text for the AI to read easily
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

export const parseTradeDocument = async (file: File): Promise<ParsedTrade[]> => {
  try {
    const ai = getAi(); 
    if (!ai) throw new Error("API Key missing. Please set your Gemini API Key in Settings.");

    const isSpreadsheet = file.name.match(/\.(csv|xlsx|xls)$/i);
    let parts: any[] = [];

    // STRATEGY: 
    // 1. If Excel/CSV -> Convert to text string -> Send as text prompt
    // 2. If Image/PDF -> Convert to Base64 -> Send as inlineData

    if (isSpreadsheet) {
        const sheetData = await readSpreadsheetAsText(file);
        parts = [
            { text: "Here is the raw data from a trade history spreadsheet:" },
            { text: sheetData },
            { text: `Analyze this data. Extract all trade executions.
            
            For each trade found:
            1. Identify the Ticker/Symbol (e.g., OGDC, PPL).
            2. Identify the Type (BUY or SELL).
            3. Extract Quantity and Price.
            4. Extract the Date (YYYY-MM-DD).
            5. Extract Broker Name if present.
            6. Extract specific charges if columns exist: Commission, Tax, CDC, Other Fees.
            
            Return a JSON array of objects.` }
        ];
    } else {
        // Handle Image/PDF
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        parts = [
            { inlineData: { mimeType: file.type, data: base64Data } },
            { text: `Analyze this trade confirmation document/image. Extract all trade executions.
            
            For each trade found:
            1. Identify the Ticker/Symbol (e.g., OGDC, PPL, TRG).
            2. Identify the Type (BUY or SELL). Look for "B", "S", "Buy", "Sell", "Debit" (Buy), "Credit" (Sell).
            3. Extract Quantity and Price.
            4. Extract the Date (YYYY-MM-DD).
            5. Look for the Broker Name (e.g., KASB, AKD, Arif Habib).
            6. Extract specific charges if visible: Commission, Tax, CDC, Other.
            
            Return a JSON array of objects.` }
        ];
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Flash is faster/cheaper for high volume text
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
              date: { type: Type.STRING },
              broker: { type: Type.STRING, nullable: true },
              commission: { type: Type.NUMBER, nullable: true },
              tax: { type: Type.NUMBER, nullable: true },
              cdcCharges: { type: Type.NUMBER, nullable: true },
              otherFees: { type: Type.NUMBER, nullable: true }
            },
            required: ["ticker", "type", "quantity", "price"]
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return [];
  } catch (error: any) {
    console.error("Error parsing document with Gemini:", error);
    throw new Error(error.message || "Failed to scan document. Please check your API Key.");
  }
};

export const fetchDividends = async (tickers: string[]): Promise<DividendAnnouncement[]> => {
    try {
        const ai = getAi(); 
        if (!ai) throw new Error("API Key missing. Please go to Settings to add one.");

        const tickerList = tickers.join(", ");
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Find recent dividend announcements (last 6 months) for these PSX tickers: ${tickerList}.
            Return ONLY a raw JSON array (no markdown) with objects having these keys: ticker, amount (number), exDate (YYYY-MM-DD), payoutDate, type (Interim/Final), period.`,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const text = response.text;
        if (!text) return [];

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return [];
    } catch (error) {
        console.error("Error fetching dividends:", error);
        throw error; 
    }
}
