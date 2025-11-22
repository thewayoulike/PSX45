import { ParsedTrade } from '../types';

// Safe access for Vite environment
const getEnvKey = () => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env.VITE_OCR_API_KEY;
    }
  } catch (e) { /* ignore */ }
  return undefined;
};

// Use Env Variable or fallback to 'helloworld' demo key
const API_KEY = getEnvKey() || 'helloworld'; 

interface ScanResult {
    trades: ParsedTrade[];
    text: string;
}

export const parseTradeDocumentOCRSpace = async (file: File): Promise<ScanResult> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('apikey', API_KEY);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('isTable', 'true'); 
    formData.append('OCREngine', '2'); 

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.IsErroredOnProcessing) {
      throw new Error(result.ErrorMessage?.[0] || 'OCR API Error');
    }

    if (!result.ParsedResults || result.ParsedResults.length === 0) {
      throw new Error('No text found in document');
    }

    let fullText = '';
    result.ParsedResults.forEach((page: any) => {
      fullText += page.ParsedText + '\n';
    });

    const trades = parseExtractedText(fullText);
    return { trades, text: fullText };

  } catch (error) {
    console.error("OCR Space Error:", error);
    throw error;
  }
};

/**
 * Robust Parser Logic (Migrated from localOcr to maintain fee detection capabilities)
 */
export const parseExtractedText = (text: string): ParsedTrade[] => {
  const trades: ParsedTrade[] = [];
  const lines = text.split(/\r?\n/);

  const tickerRegex = /\b([A-Z]{3,5})\b/; // PSX Tickers (e.g. OGDC, PPL)
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})|(\d{2}-[A-MMM]-\d{4})/i);
  const globalDate = dateMatch ? formatDate(dateMatch[0]) : undefined;

  lines.forEach(line => {
    // Clean line: remove currency symbols and noise
    const cleanLine = line.replace(/Rs\.?|PKR|\/-\s?/gi, '').trim();
    const upperLine = cleanLine.toUpperCase();
    
    // Keyword Detection (More permissive & prioritizes SELL)
    let type: 'BUY' | 'SELL' | undefined;
    
    // Check SELL indicators first (Sold, Sale, Credit, Cr., S)
    if (upperLine.match(/\b(SELL|SALE|SOLD|CREDIT|CR\.?|S)\b/)) {
        type = 'SELL';
    } 
    // Check BUY indicators next (Bought, Purchase, Debit, Dr., B)
    else if (upperLine.match(/\b(BUY|PURCHASE|BOUGHT|DEBIT|DR\.?|B)\b/)) {
        type = 'BUY';
    }

    // Extract Ticker
    const tickerMatch = upperLine.match(tickerRegex);
    if (!tickerMatch) return;
    const ticker = tickerMatch[1];
    
    // Ignore common words that look like tickers
    const IGNORED = ['TOTAL', 'DATE', 'PAGE', 'LTD', 'PVT', 'COMM', 'BALANCE', 'AMOUNT', 'RATE', 'NET', 'GROSS', 'TYPE', 'QTY', 'PRICE', 'VAL', 'SEC', 'LIMITED', 'FINAL', 'NOTE'];
    if (IGNORED.includes(ticker)) return;

    // Extract Numbers
    const numbers = cleanLine.match(/[\d,]+(\.\d+)?/g);
    if (!numbers || numbers.length < 2) return;

    const cleanNumbers = numbers
        .map(n => parseFloat(n.replace(/,/g, '')))
        .filter(n => !isNaN(n) && n > 0);

    if (cleanNumbers.length < 2) return;

    let quantity = 0;
    let price = 0;
    let isValid = false;

    // 1. Try Mathematical Consistency: Qty * Price ≈ Amount
    if (cleanNumbers.length >= 3) {
        for (let i = 0; i < cleanNumbers.length; i++) {
            for (let j = 0; j < cleanNumbers.length; j++) {
                if (i === j) continue;
                for (let k = 0; k < cleanNumbers.length; k++) {
                    if (k === i || k === j) continue;
                    
                    const A = cleanNumbers[i];
                    const B = cleanNumbers[j];
                    const C = cleanNumbers[k];

                    // Check A * B ~= C (with tolerance)
                    if (Math.abs((A * B) - C) < 1.5 || (C > 0 && Math.abs((A * B) - C) / C < 0.01)) {
                        // Found match! Now distinguish Qty vs Price.
                        if (A > 500 && B < 500) { quantity = A; price = B; }
                        else if (B > 500 && A < 500) { quantity = B; price = A; }
                        else { quantity = A; price = B; } // Fallback
                        isValid = true;
                        break;
                    }
                }
                if (isValid) break;
            }
            if (isValid) break;
        }
    }

    // 2. Fallback Heuristic (Only if Type is explicitly known)
    if (!isValid && type && cleanNumbers.length >= 2) {
        const n1 = cleanNumbers[0];
        const n2 = cleanNumbers[1];
        
        // Heuristic: Integers vs Decimals
        if (n1 % 1 === 0 && n2 % 1 !== 0) { quantity = n1; price = n2; }
        else if (n2 % 1 === 0 && n1 % 1 !== 0) { quantity = n2; price = n1; }
        else { quantity = n1; price = n2; } // Assume Qty first
        isValid = true;
    }

    if (isValid) {
        // Final Sanity Checks
        if (price > 5000 || price < 0.1) return; 
        if (quantity < 1) return;

        // --- Fee Extraction Logic ---
        
        const grossAmount = quantity * price;
        let commission: number | undefined;
        let tax: number | undefined;
        let cdcCharges: number | undefined;

        // Potential Fees: Numbers that are NOT Qty, Price, or Gross/Net Amount
        const potentialFees = cleanNumbers.filter(n => {
            if (Math.abs(n - quantity) < 0.01) return false;
            if (Math.abs(n - price) < 0.01) return false;
            if (Math.abs(n - grossAmount) < 1.0) return false; // Gross
            if (Math.abs(n - grossAmount) < (grossAmount * 0.05)) return false; // Net Amount (Gross +/- 5%)
            return true;
        }).sort((a, b) => b - a); // Sort descending

        // Strategy A: Look for Tax relationship (Tax ~ 15% or 13% or 16% of Comm)
        for (const commCand of potentialFees) {
             const taxCand15 = potentialFees.find(t => Math.abs(t - (commCand * 0.15)) < 0.1); // 15%
             const taxCand13 = potentialFees.find(t => Math.abs(t - (commCand * 0.13)) < 0.1); // 13% SST
             const taxCand16 = potentialFees.find(t => Math.abs(t - (commCand * 0.16)) < 0.1); // 16% FED

             if (taxCand15) {
                 commission = commCand;
                 tax = taxCand15;
                 break;
             }
             if (taxCand13) {
                 commission = commCand;
                 tax = taxCand13;
                 break;
             }
             if (taxCand16) {
                 commission = commCand;
                 tax = taxCand16;
                 break;
             }
        }

        // Strategy B: Look for CDC (Qty * 0.005)
        const expectedCDC = quantity * 0.005;
        const cdcCand = potentialFees.find(n => Math.abs(n - expectedCDC) < 0.1);
        if (cdcCand) {
            cdcCharges = cdcCand;
        } else {
             // Fallback: Check for small fixed amounts like 5.0, 2.5
             if (potentialFees.includes(5.0) && !commission && !tax) cdcCharges = 5.0;
        }

        // Strategy C: Fallback Commission (Approx 0.15%) if not found via Tax
        if (!commission) {
            const expectedComm = grossAmount * 0.0015;
            // Look for number within 30% of expected commission
            const commCand = potentialFees.find(n => Math.abs(n - expectedComm) < (expectedComm * 0.3));
            if (commCand) {
                commission = commCand;
            }
        }

        trades.push({
            ticker,
            type: type || 'BUY', // Default to BUY if math valid but type missing
            quantity,
            price,
            date: globalDate,
            commission,
            tax,
            cdcCharges
        });
    }
  });

  return trades;
};

const formatDate = (dateStr: string) => {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return undefined;
        return d.toISOString().split('T')[0];
    } catch {
        return undefined;
    }
};