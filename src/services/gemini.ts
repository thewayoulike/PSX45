{
type: uploaded file
fileName: src/services/gemini.ts
fullContent:
import { GoogleGenAI, Type } from "@google/genai";
import { ParsedTrade, DividendAnnouncement } from '../types';

// 1. Store the user's key in memory
let userProvidedKey: string | null = null;
let aiClient: GoogleGenAI | null = null;

export const setGeminiApiKey = (key: string | null) => {
    userProvidedKey = key;
    // Reset client so it recreates with the new key next time getAi() is called
    aiClient = null;
};

// 2. Safe access for Vite environment
const getApiKey = () => {
  // PRIORITIZE USER KEY
  if (userProvidedKey) return userProvidedKey;

  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (e) { /* ignore */ }
  
  try {
    // @ts-ignore
    return process.env.API_KEY;
  } catch (e) { /* ignore */ }
  
  return undefined;
};

// 3. LAZY INITIALIZATION
const getAi = (): GoogleGenAI | null => {
    if (aiClient) return aiClient;
    
    const key = getApiKey();
    // If key is missing, we return null
    if (!key) {
        console.warn("Gemini API Key is missing. AI features will be disabled.");
        return null;
    }

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
            text: "Extract the trade details from this document. Return a JSON array of trades. For each trade, include ticker, type (BUY/SELL), quantity, price, date (YYYY-MM-DD), broker (if visible), commission, tax, and cdcCharges. If specific fees aren't visible, omit them."
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
              cdcCharges: { type: Type.NUMBER, nullable: true }
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
  } catch (error) {
    console.error("Error parsing trade document with Gemini:", error);
    throw error; // Re-throw so UI handles it
  }
};

export const fetchDividends = async (tickers: string[]): Promise<DividendAnnouncement[]> => {
    try {
        const ai = getAi(); 
        if (!ai) return [];

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
        return [];
    }
}
}
