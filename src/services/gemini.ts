import { GoogleGenAI, Type } from "@google/genai";
import { ParsedTrade, DividendAnnouncement } from '../types';

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

export const parseTradeDocument = async (file: File): Promise<ParsedTrade[]> => {
  try {
    const ai = getAi(); 
    if (!ai) throw new Error("API Key missing. Please set your Gemini API Key in Settings.");

    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const mimeType = file.type;
    const model = "gemini-2.5-flash"; 

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: `Analyze this trade confirmation document/image. Extract all trade executions.
            
            For each trade found:
            1. Identify the Ticker/Symbol (e.g., OGDC, PPL, TRG).
            2. Identify the Type (BUY or SELL). Look for "B", "S", "Buy", "Sell", "Debit" (Buy), "Credit" (Sell).
            3. Extract Quantity and Price.
            4. Extract the Date (YYYY-MM-DD).
            5. Look for the Broker Name (e.g., KASB, AKD, Arif Habib).
            6. Extract specific charges if visible: 
               - Commission
               - Tax (SST, WHT, CVT)
               - CDC Charges
               - Other Fees (Regulatory fees, FED, etc).
            
            Return a JSON array of objects.`
          }
        ]
      },
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
    console.error("Error parsing trade document with Gemini:", error);
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
