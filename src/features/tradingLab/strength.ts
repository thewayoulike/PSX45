import {DEFAULT_PLAN,sizePlan,type Plan} from './engine';
import type {ScanRow} from './scanner';

export type ScanCosts=Pick<Plan,'feePct'|'slipPct'>;
export type SetupStrength={label:'Strong'|'Moderate'|'Weak'|'Skip'|'No setup'|'Incomplete'|'Unavailable';rank:number;context:string;reasons:string[];summary?:string;netRR?:number;volumeRatio?:number|null};
const grade=(points:number,context:string,reasons:string[]):SetupStrength=>({label:points>=3?'Strong':points===2?'Moderate':'Weak',rank:points>=3?3:points===2?2:1,context,reasons});
/** Transparent screening heuristic, not calibrated odds or a forecast. Uses only the scan snapshot. */
export function setupStrength(row:ScanRow,costs:ScanCosts=DEFAULT_PLAN):SetupStrength{
  if(row.error)return {label:'Unavailable',rank:-2,context:'Feed failed',reasons:[row.error]};
  if(row.entry){
    const entry=row.entry,context=entry.status==='Session ended'?'Historical setup':!entry.fresh?'Delayed snapshot':entry.recent?'Recent at scan':'Earlier breakout';
    if(entry.check?.state==='incomplete'||!entry.check)return {label:'Incomplete',rank:-1,context,reasons:[entry.check?.reason||'Session candles unavailable.']};
    if(!entry.check.trigger)return {label:'No setup',rank:0,context:entry.status,reasons:[entry.check.reason]};
    if(entry.targetReview?.target===null)return {label:'Skip',rank:0,context,reasons:[`Skip — ${entry.targetReview.reason}`,...entry.targetReview.warnings]};
    if(!entry.levels||!entry.last)return {label:'Incomplete',rank:-1,context,reasons:['Confirmed entry needs valid stop and target levels to be rated.']};
    const reasons:string[]=['A completed candle confirmed the opening-range breakout.'];
    // Quality is assessed at confirmation. Later target/stop touches belong to progress.
    let points=1;
    const volume=Number.isFinite(entry.check.volumeRatio)?entry.check.volumeRatio:null;
    if(volume!=null&&Number.isFinite(volume)){
      reasons.push(`Breakout volume: ${volume.toFixed(2)}× the opening-candle average${volume>=1.5?' (meets 1.5× check).':' (below 1.5× check).'}`);
      if(volume>=1.5)points++;
    }else reasons.push('Breakout volume confirmation is unavailable.');
    const sized=sizePlan({...DEFAULT_PLAN,feePct:costs.feePct,slipPct:costs.slipPct,symbol:row.symbol,...entry.levels});
    if(sized.skipReason)return {label:'Skip',rank:0,context,netRR:sized.rr,volumeRatio:volume,reasons:[sized.skipReason,'Even a fill at the target leaves no positive profit after estimated fees and slippage.']};
    reasons.push(...sized.errors);
    const rr=sized.rr;
    const rrOk=Number.isFinite(rr)&&rr>=1.5;
    if(rrOk)points++;
    reasons.push(Number.isFinite(rr)?`Reward/risk after estimated costs: ${rr.toFixed(2)}R${rrOk?' (meets 1.50R check).':' (below 1.50R check).'}`:'Reward/risk after costs could not be calculated.');
    if(sized.errors.length||!Number.isFinite(rr))return {label:'Incomplete',rank:-1,context,reasons,summary:'Cost and sizing checks could not be completed.'};
    if(rr<1)points=Math.min(points,1);
    let summary=rr<1?'Less than Rs. 1 potential net profit per Rs. 1 modeled loss.':!rrOk?'Net reward/risk is below the 1.50R check.':volume==null?'Breakout volume is unavailable.':volume<1.5?'Breakout volume is below the 1.5× check.':'Volume, net reward/risk and closing breakout checks passed at entry.';
    if(entry.targetReview){
      reasons.push(`Target basis: ${entry.targetReview.reason}.`,...entry.targetReview.warnings);
      if(!entry.targetReview.complete)return {label:'Incomplete',rank:-1,context,reasons,summary:'Target checks are missing data; setup quality is unverified.',netRR:rr,volumeRatio:volume};
      else if(entry.targetReview.warnings.length){points=Math.min(points,2);if(rrOk)summary='Target checks need review: '+entry.targetReview.warnings[0];}
    }
    else return {label:'Incomplete',rank:-1,context,reasons:[...reasons,'Target context is unavailable.'],summary:'Target checks are unavailable.',netRR:rr,volumeRatio:volume};
    return {...grade(points,context,reasons),summary,netRR:rr,volumeRatio:volume};
  }
  if(row.daily){
    const daily=row.daily,context=`Daily snapshot · ${daily.date}`;
    if(!daily.setups.length)return {label:'No setup',rank:0,context,reasons:['No daily setup rule matched.']};
    const reasons=[`Matched: ${daily.setups.join(', ')}.`];let points=0;
    const recovery=daily.setups.some(setup=>setup!=='RSI below 30');
    if(recovery)points++;else reasons.push('Oversold alone does not confirm a recovery.');
    if(daily.last.close>daily.ma20){points++;reasons.push('Close is above the 20-day average.');}else reasons.push('Close is below or equal to the 20-day average.');
    if(daily.relativeVolume!=null&&Number.isFinite(daily.relativeVolume)){
      reasons.push(`Daily volume: ${daily.relativeVolume.toFixed(2)}× the previous 20-session average${daily.relativeVolume>=1.5?' (meets 1.5× check).':' (below 1.5× check).'}`);
      if(daily.relativeVolume>=1.5)points++;
    }else reasons.push('Daily volume confirmation is unavailable.');
    if(!recovery)points=Math.min(points,1);
    return grade(points,context,reasons);
  }
  return {label:'Incomplete',rank:-1,context:'No snapshot',reasons:['Usable scan data is unavailable.']};
}
