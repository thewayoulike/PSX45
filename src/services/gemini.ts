import { GoogleGenerativeAI } from "@google/generative-ai";
import { ParsedTrade, DividendAnnouncement } from '../types';
import * as XLSX from 'xlsx';

let userProvidedKey: string | null = null;
let genAI: GoogleGenerativeAI | null = null;

const sanitizeKey = (key: string): string => {
    return key.replace(/[^\x00-\x7F]/g, "").trim();
};

export const setGeminiApiKey = (key: string | null) => {
    userProvidedKey = key ? sanitizeKey(key) : null;
    genAI = null;
};

const getModel = () => {
    if (genAI) return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const key = userProvidedKey;
    if (!key) return null;
    
    try {
        genAI = new GoogleGenerativeAI(key);
        return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
    const model = getModel(); 
    if (!model) throw new Error("API Key missing. Please set your Gemini API Key in Settings.");

    const isSpreadsheet = file.name.match(/\.(csv|xlsx|xls)$/i);
    let promptParts: any[] = [];

    if (isSpreadsheet) {
        const sheetData = await readSpreadsheetAsText(file);
        promptParts = [
            "Here is the raw data from a trade history spreadsheet:",
            sheetData,
            "Analyze this data. Extract all trade executions. Return JSON array with properties: ticker, type (BUY/SELL), quantity, price, date, broker, commission, tax, cdcCharges, otherFees."
        ];
    } else {
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        
        promptParts = [
            { inlineData: { mimeType: file.type, data: base64Data } },
            "Analyze this trade confirmation document. Extract all trade executions. Return JSON array with properties: ticker, type (BUY/SELL), quantity, price, date, broker, commission, tax, cdcCharges, otherFees."
        ];
    }

    const result = await model.generateContent(promptParts);
    const response = await result.response;
    const text = response.text();

    const jsonString = extractJsonArray(text);
    if (jsonString) return JSON.parse(jsonString);
    
    return [];
  } catch (error: any) {
    console.error("Error parsing document:", error);
    throw new Error(error.message || "Failed to scan document.");
  }
};

export const fetchDividends = async (tickers: string[], months: number = 6): Promise<DividendAnnouncement[]> => {
    try {
        const model = getModel(); 
        if (!model) throw new Error("API Key missing. Please go to Settings to add one.");

        const tickerList = tickers.join(", ");
        
        // Note: Google Search tool is not standard in the client-side SDK. 
        // We rely on the model's internal knowledge or prompt capabilities here.
        const result = await model.generateContent([
            `Find all dividend announcements declared in the LAST ${months} MONTHS for these Pakistan Stock Exchange (PSX) tickers: ${tickerList}.
            Return ONLY a raw JSON array (no markdown) with objects:
            [{ "ticker": "ABC", "amount": 5.5, "exDate": "YYYY-MM-DD", "payoutDate": "YYYY-MM-DD", "type": "Interim", "period": "1st Quarter" }]
            
            Ignore any dividends older than ${months} months.`
        ]);

        const response = await result.response;
        const text = response.text();

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
