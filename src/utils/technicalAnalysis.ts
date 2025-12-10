import { OHLCData } from '../services/psxData';

// --- NEW: ATR for Volatility-based Targets ---
export const calculateATR = (data: OHLCData[], period: number = 14): number => {
    if (data.length < period + 1) return 0;
    let trSum = 0;
    // Calculate True Range (TR)
    for (let i = data.length - period; i < data.length; i++) {
        const current = data[i];
        const prev = data[i - 1];
        const hl = current.high - current.low;
        const hc = Math.abs(current.high - prev.close);
        const lc = Math.abs(current.low - prev.close);
        const tr = Math.max(hl, hc, lc);
        trSum += tr;
    }
    return trSum / period;
};

export const calculateRSI = (data: OHLCData[], period: number = 14): number => {
    if (data.length < period + 1) return 0;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        if (change > 0) gains += change;
        else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
};

export const calculatePivots = (high: number, low: number, close: number) => {
    const p = (high + low + close) / 3;
    return { 
        p, 
        r1: (2 * p) - low, 
        s1: (2 * p) - high,
        r2: p + (high - low), 
        s2: p - (high - low),
        r3: high + 2 * (p - low),
        s3: low - 2 * (high - p)
    };
};

export const calculateSMA = (data: OHLCData[], period: number): number => {
    if (data.length < period) return 0;
    const slice = data.slice(-period);
    return slice.reduce((acc, curr) => acc + curr.close, 0) / period;
};

export const generateSignal = (currentPrice: number, rsi: number, sma50: number, sma200: number) => {
    let trend = "NEUTRAL";
    let signal = "WAIT";
    let strength = "WEAK";

    // 1. Trend Analysis
    if (sma50 > 0) {
        if (currentPrice > sma50) {
            trend = "BULLISH";
            strength = currentPrice > sma50 * 1.02 ? "STRONG" : "WEAK";
        } else {
            trend = "BEARISH";
            strength = currentPrice < sma50 * 0.98 ? "STRONG" : "WEAK";
        }
    }

    // 2. Signal Logic
    if (rsi > 0) {
        if (rsi < 30) signal = "BUY (Oversold)";
        else if (rsi > 70) signal = "SELL (Overbought)";
        else if (rsi > 60 && trend === "BULLISH") signal = "CONTINUATION BUY";
        else if (rsi < 40 && trend === "BEARISH") signal = "CONTINUATION SELL";
        else if (currentPrice > sma200 && rsi < 45) signal = "DIP BUY";
        else signal = "WAIT";
    }

    return { trend, signal, strength };
};
