import { OHLCData } from '../services/psxData';

// --- RSI Calculation ---
export const calculateRSI = (data: OHLCData[], period: number = 14): number => {
    if (data.length < period + 1) return 50;
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

// --- Pivot Points (Standard) ---
export const calculatePivots = (high: number, low: number, close: number) => {
    const p = (high + low + close) / 3;
    const r1 = (2 * p) - low;
    const s1 = (2 * p) - high;
    const r2 = p + (high - low);
    const s2 = p - (high - low);
    const r3 = high + 2 * (p - low);
    const s3 = low - 2 * (high - p);
    return { p, r1, r2, r3, s1, s2, s3 };
};

// --- Volatility & Change ---
export const calculateVolatility = (data: OHLCData[], period: number = 20): number => {
    if (data.length < period) return 0;
    const slice = data.slice(-period).map(d => d.close);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
    return (Math.sqrt(variance) / mean) * 100; // Relative Volatility %
};

export const calculateChange = (data: OHLCData[], days: number): number => {
    if (data.length <= days) return 0;
    const current = data[data.length - 1].close;
    const past = data[data.length - 1 - days].close;
    return ((current - past) / past) * 100;
};

// --- Simple Moving Average ---
export const calculateSMA = (data: OHLCData[], period: number): number => {
    if (data.length < period) return 0;
    const slice = data.slice(-period);
    return slice.reduce((acc, curr) => acc + curr.close, 0) / period;
};

// --- Signal Generator ---
export const generateSignal = (currentPrice: number, rsi: number, sma50: number) => {
    let trend = "NEUTRAL";
    let signal = "WAIT";
    let sentiment = "Neutral";

    if (currentPrice > sma50) trend = "BULLISH";
    else if (currentPrice < sma50) trend = "BEARISH";

    if (rsi < 30) { signal = "BUY"; sentiment = "Oversold"; }
    else if (rsi > 70) { signal = "SELL"; sentiment = "Overbought"; }
    else if (rsi > 60 && trend === "BULLISH") { signal = "STRONG BUY"; }
    else if (rsi < 40 && trend === "BEARISH") { signal = "STRONG SELL"; }

    return { trend, signal, sentiment };
};
