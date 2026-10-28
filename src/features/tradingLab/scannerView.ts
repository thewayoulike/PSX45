import {pktDay} from './engine';
import type {ScanRow} from './scanner';
import type {SetupStrength} from './strength';

/** Snapshot recency ages even when a one-off scan has stopped. Never invent a new outcome. */
export function recentOpenSnapshot(row:ScanRow,now:number){
 const e=row.entry;
 return !!e?.fresh&&!!e.recent&&e.progress?.state==='active'&&e.date===pktDay(now)&&e.triggerAt!=null&&e.latestCloseAt!=null&&now>=row.checkedAt&&now-e.triggerAt<=600000&&now-e.latestCloseAt<=600000;
}
export function missingLevelsReason(row:ScanRow){
 if(row.error)return 'Levels unavailable: candle feed failed.';
 const entry=row.entry;
 if(entry?.targetReview?.target===null)return `Skip — ${entry.targetReview.reason}`;
 if(!entry?.check)return 'Current-session candles unavailable.';
 if(entry.check.state==='expired')return 'No entry: window ended without a match.';
 if(entry.check.state==='incomplete')return 'Cannot assess entry: candle or volume data is incomplete.';
 if(entry.check.state==='waiting')return 'Waiting for a qualifying completed close.';
 return 'Entry confirmed; valid exit levels could not be calculated.';
}
export function scanDiagnostics(rows:ScanRow[],ratings:ReadonlyMap<string,SetupStrength>){
 const matching=rows.filter(row=>!!row.entry?.check?.trigger);
 return {
  evaluated:rows.filter(row=>!row.error).length,
  failed:rows.filter(row=>!!row.error).length,
  matched:matching.length,
  stronger:matching.filter(row=>['Strong','Moderate'].includes(ratings.get(row.symbol)?.label||'')).length,
  lowReward:matching.filter(row=>ratings.get(row.symbol)?.label==='Weak'&&(ratings.get(row.symbol)?.netRR??Infinity)<1).length,
  skipped:matching.filter(row=>ratings.get(row.symbol)?.label==='Skip').length,
  incomplete:rows.filter(row=>ratings.get(row.symbol)?.label==='Incomplete').length,
  expired:rows.filter(row=>row.entry?.check?.state==='expired').length,
  waiting:rows.filter(row=>row.entry?.check?.state==='waiting').length,
 };
}
