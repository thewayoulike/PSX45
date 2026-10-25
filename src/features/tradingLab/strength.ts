import {DEFAULT_PLAN,sizePlan} from './engine';
import type {ScanRow} from './scanner';

export type SetupStrength={label:'Strong'|'Moderate'|'Weak'|'No setup'|'Incomplete'|'Unavailable';rank:number;context:string;reasons:string[]};
const grade=(points:number,context:string,reasons:string[]):SetupStrength=>({label:points>=3?'Strong':points===2?'Moderate':'Weak',rank:points>=3?3:points===2?2:1,context,reasons});
/** Transparent screening heuristic, not calibrated odds or a forecast. Uses only the scan snapshot. */
export function setupStrength(row:ScanRow):SetupStrength{
  if(row.error)return {label:'Unavailable',rank:-2,context:'Feed failed',reasons:[row.error]};
  if(row.entry){
    const entry=row.entry,context=entry.status==='Session ended'?'Historical setup':!entry.fresh?'Delayed snapshot':entry.recent?'Recent at scan':'Earlier breakout';
    if(entry.check?.state==='incomplete'||!entry.check)return {label:'Incomplete',rank:-1,context,reasons:[entry.check?.reason||'Session candles unavailable.']};
    if(!entry.check.trigger)return {label:'No setup',rank:0,context:entry.status,reasons:[entry.check.reason]};
    if(!entry.levels||!entry.last)return {label:'Incomplete',rank:-1,context,reasons:['Confirmed entry needs valid stop and target levels to be rated.']};
    const reasons:string[]=['A completed candle confirmed the opening-range breakout.'];
    let points=0;
    const volume=entry.check.volumeRatio;
    if(volume!=null&&Number.isFinite(volume)){
      reasons.push(`Breakout volume: ${volume.toFixed(2)}× the opening-candle average${volume>=1.5?' (meets 1.5× check).':' (below 1.5× check).'}`);
      if(volume>=1.5)points++;
    }else reasons.push('Breakout volume confirmation is unavailable.');
    const sized=sizePlan({...DEFAULT_PLAN,symbol:row.symbol,...entry.levels});
    reasons.push(...sized.errors);
    const rr=sized.rr;
    const rrOk=Number.isFinite(rr)&&rr>=1.5;
    if(rrOk)points++;
    reasons.push(Number.isFinite(rr)?`Reward/risk after estimated costs: ${rr.toFixed(2)}R${rrOk?' (meets 1.50R check).':' (below 1.50R check).'}`:'Reward/risk after costs could not be calculated.');
    const holds=entry.check.level!=null&&entry.last.close>entry.check.level&&entry.last.close>entry.levels.stop&&entry.last.close<entry.levels.target;
    if(holds){points++;reasons.push('Last close holds above the opening range and remains between stop and target.');}
    else reasons.push(entry.last.close<=entry.levels.stop?'Last close is at or below the test stop.':entry.last.close>=entry.levels.target?'Last close is already at or above the test target.':'Last close no longer holds above the opening range.');
    // A lost breakout or low net reward cannot receive a strong grade from volume alone.
    if(!holds||!Number.isFinite(rr)||rr<1||sized.errors.length)points=Math.min(points,1);
    return grade(points,context,reasons);
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
