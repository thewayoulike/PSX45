import React, { useState, useMemo } from 'react';
import { Trophy, AlertTriangle, CheckCircle, XCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface Criterion {
  id: number;
  name: string;
  weight: number;
  // Rubric text for scores 0, 2, 4, 6, 8, 10
  rubric: Record<number, string>;
}

// Data derived from 'YC Moonshot Tracker.xlsx - Rubric Details.csv' and 'Scorecard.csv'
const CRITERIA: Criterion[] = [
  { 
    id: 1, name: "Revenue Growth Consistency", weight: 14, 
    rubric: { 0: "Declining or negative", 2: "0–5%", 4: "5–10%", 6: "10–15%", 8: "15–20%", 10: ">20%" } 
  },
  { 
    id: 2, name: "Profit-Margin Expansion", weight: 9, 
    rubric: { 0: "Flat or declining", 2: "+0.5 pp", 4: "+1.0 pp", 6: "+1.5 pp", 8: "+2.0 pp", 10: ">2.0 pp" } 
  },
  { 
    id: 3, name: "Leverage (Debt/Equity)", weight: 5, 
    rubric: { 0: ">2.0", 2: "1.5–2.0", 4: "1.0–1.5", 6: "0.5–1.0", 8: "0.2–0.5", 10: "<0.2" } 
  },
  { 
    id: 4, name: "Return on Equity (ROE)", weight: 9, 
    rubric: { 0: "<5%", 2: "5–8%", 4: "8–12%", 6: "12–15%", 8: "15–20%", 10: ">20%" } 
  },
  { 
    id: 5, name: "Management & Insider Ownership", weight: 5, 
    rubric: { 0: "<10%", 2: "10–20%", 4: "20–30%", 6: "30–40%", 8: "40–50%", 10: ">50%" } 
  },
  { 
    id: 6, name: "TAM Growth", weight: 7, 
    rubric: { 0: "≤0%", 2: "0–5%", 4: "5–10%", 6: "10–15%", 8: "15–20%", 10: ">20%" } 
  },
  { 
    id: 7, name: "Long-Term Industry Tailwinds", weight: 4, 
    rubric: { 0: "No tailwind/declining", 2: "Weak/cyclical", 4: "Moderate growth", 6: "Clear tailwind", 8: "High-growth trend", 10: "Core to megatrend" } 
  },
  { 
    id: 8, name: "Margin of Safety (Valuation)", weight: 10, 
    rubric: { 0: ">2× overvalued", 2: "1.5–2.0× overvalued", 4: "1.2–1.5× overvalued", 6: "Fair ±10%", 8: "0–20% undervalued", 10: ">20% undervalued" } 
  },
  { 
    id: 9, name: "Customer Concentration", weight: 4, 
    rubric: { 0: ">80%", 2: "60–80%", 4: "40–60%", 6: "20–40%", 8: "10–20%", 10: "<10%" } 
  },
  { 
    id: 10, name: "Global Expansion Potential", weight: 4, 
    rubric: { 0: "Domestic only", 2: "Export <5%", 4: "Export 5–15%", 6: "2 markets", 8: "≥3 markets", 10: "≥5 markets + JV" } 
  },
  { 
    id: 11, name: "Sustainable Comp. Advantage", weight: 8, 
    rubric: { 0: "None", 2: "Low brand power", 4: "Niche IP/cost", 6: "Brand/network effects", 8: "Patents + brand", 10: "Monopolistic moat" } 
  },
  { 
    id: 12, name: "Valuation Ratios (P/E & PEG)", weight: 8, 
    rubric: { 0: "P/E>2× & PEG>2", 2: "P/E 1.5–2×", 4: "P/E 1.2–1.5×", 6: "P/E ±10% sector", 8: "P/E<sector OR PEG<1.2", 10: "P/E<sector AND PEG<1" } 
  },
  { 
    id: 13, name: "Free Cash Flow Positivity", weight: 5, 
    rubric: { 0: "Negative 3/3yrs", 2: "Negative 2/3yrs", 4: "Negative 1/3yrs", 6: "Flat/breakeven", 8: "Positive every year", 10: ">15% growth pa" } 
  },
  { 
    id: 14, name: "Institutional Investor Interest", weight: 4, 
    rubric: { 0: "None", 2: "Small local funds", 4: "Regional VCs/MFs", 6: "Large MFs/sovereign", 8: "Top‐tier VCs/global", 10: "Multiple marquee backers" } 
  },
  { 
    id: 15, name: "Price Momentum", weight: 4, 
    rubric: { 0: "Underperf >20%", 2: "Underperf 10–20%", 4: "±10%", 6: "Outperf 10–20%", 8: "Outperf 20–30%", 10: "Outperf >30%" } 
  },
];

export const MoonshotCalculator: React.FC = () => {
  const [scores, setScores] = useState<Record<number, number>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleExpand = (id: number) => setExpandedId(expandedId === id ? null : id);

  const handleScore = (id: number, score: number) => {
    setScores(prev => ({ ...prev, [id]: score }));
    setExpandedId(null); // Auto collapse after selection
  };

  const { totalScore, maxScore, percentage, call, callColor } = useMemo(() => {
    let weightedSum = 0;
    let maxWeightedSum = 0;

    CRITERIA.forEach(c => {
      const userScore = scores[c.id] || 0;
      weightedSum += userScore * c.weight;
      maxWeightedSum += 10 * c.weight;
    });

    const pct = maxWeightedSum > 0 ? (weightedSum / maxWeightedSum) * 100 : 0;
    
    // Investment Zones based on "Rubric Details.csv"
    let action = "Do Not Invest";
    let color = "text-rose-600 bg-rose-50 border-rose-200";

    if (pct >= 85) {
        action = "Multibagger";
        color = "text-emerald-600 bg-emerald-50 border-emerald-200";
    } else if (pct >= 71) {
        action = "Strong Investment Call";
        color = "text-blue-600 bg-blue-50 border-blue-200";
    } else if (pct >= 60) {
        action = "Watchlist";
        color = "text-amber-600 bg-amber-50 border-amber-200";
    }

    return { totalScore: weightedSum, maxScore: maxWeightedSum, percentage: pct, call: action, callColor: color };
  }, [scores]);

  return (
    <div className="space-y-6">
      {/* Result Card */}
      <div className={`p-6 rounded-3xl border ${callColor} flex flex-col items-center justify-center text-center shadow-sm transition-all`}>
          <div className="text-xs font-bold uppercase tracking-widest opacity-70 mb-2">Moonshot Score</div>
          <div className="text-5xl font-black mb-2 tracking-tighter">{percentage.toFixed(1)}<span className="text-2xl text-slate-400">/100</span></div>
          <div className={`text-lg font-bold px-4 py-1 rounded-full border bg-white ${callColor}`}>
              {call}
          </div>
          <div className="mt-4 w-full bg-white/50 h-2 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${percentage >= 85 ? 'bg-emerald-500' : percentage >= 71 ? 'bg-blue-500' : percentage >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                style={{ width: `${percentage}%` }}
              ></div>
          </div>
      </div>

      {/* Criteria List */}
      <div className="space-y-3">
        {CRITERIA.map((criterion) => {
          const currentScore = scores[criterion.id];
          const isExpanded = expandedId === criterion.id;
          
          return (
            <div key={criterion.id} className={`bg-white border transition-all duration-300 overflow-hidden ${isExpanded ? 'border-emerald-500 ring-1 ring-emerald-500/20 rounded-2xl shadow-md' : 'border-slate-200 rounded-xl hover:border-emerald-300'}`}>
                
                {/* Header Row */}
                <div 
                    onClick={() => toggleExpand(criterion.id)}
                    className="flex items-center justify-between p-4 cursor-pointer"
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${currentScore !== undefined ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                            {currentScore !== undefined ? currentScore : '-'}
                        </div>
                        <div>
                            <div className="font-bold text-slate-800 text-sm">{criterion.name}</div>
                            <div className="text-[10px] text-slate-400 font-medium">Weight: {criterion.weight}</div>
                        </div>
                    </div>
                    {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </div>

                {/* Expanded Selection Area */}
                {isExpanded && (
                    <div className="px-4 pb-4 pt-0 animate-in slide-in-from-top-2">
                        <div className="h-px w-full bg-slate-100 mb-3"></div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[0, 2, 4, 6, 8, 10].map(score => (
                                <button
                                    key={score}
                                    onClick={() => handleScore(criterion.id, score)}
                                    className={`text-left p-2 rounded-lg border text-xs transition-all flex flex-col gap-1 ${
                                        scores[criterion.id] === score 
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md transform scale-[1.02]' 
                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-white'
                                    }`}
                                >
                                    <span className={`font-bold ${scores[criterion.id] === score ? 'text-emerald-100' : 'text-slate-400'}`}>Score {score}</span>
                                    <span className="leading-tight">{criterion.rubric[score]}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
