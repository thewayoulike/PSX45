import { sizePlan, type Plan } from './engine';
import {parseWorkflow,type WorkflowSnapshot} from './workflow';
export type LabTicket={id:string;createdAt:string;plan:Plan;quantity:number;sourceDate:string;note:string;entrySource?:string;workflow?:WorkflowSnapshot};
export type LabBook={watchlist:string; tickets:LabTicket[];watchlistUpdatedAt?:string;deletedTicketIds?:string[]};
export const DEFAULT_WATCHLIST='HBL, MEBL, OGDC, PPL, HUBC, FFC, LUCK, SYS';
export const labKey=(email:string)=>'psx-trading-lab:v1:'+encodeURIComponent(email.trim().toLowerCase());
export const LAB_CHANGED='psx-lab-changed';
export function notifyLab(){if(typeof window!=='undefined')window.dispatchEvent(new Event(LAB_CHANGED));}
export function parseWatchlist(value:string){
  const symbols=[...new Set(value.toUpperCase().split(/[\s,]+/).filter(Boolean))];
  if(!symbols.length||symbols.length>20||symbols.some(s=>!/^[A-Z][A-Z0-9.-]{0,19}$/.test(s)))throw new Error('Enter 1–20 PSX symbols, separated by commas.');
  return symbols;
}
export function readLab(email:string,storage:Pick<Storage,'getItem'>=localStorage):LabBook{
  const fallback={watchlist:DEFAULT_WATCHLIST,tickets:[]};
  if(!email)return fallback;
  try{
    const raw=JSON.parse(storage.getItem(labKey(email))||'null');if(!raw||typeof raw.watchlist!=='string'||!Array.isArray(raw.tickets))return fallback;
    parseWatchlist(raw.watchlist);
    return parseLab(raw);
  }catch{return fallback;}
}
export function writeLab(email:string,book:LabBook,storage:Pick<Storage,'setItem'>&Partial<Pick<Storage,'getItem'>>=localStorage){
  if(!email)throw new Error('Sign in before saving lab plans.');
  parseWatchlist(book.watchlist);
  const previous=storage.getItem?.(labKey(email));
  if(previous)parseLab(JSON.parse(previous));
  storage.setItem(labKey(email),JSON.stringify(parseLab(book)));
  notifyLab();
}

/** Strict cloud validation: never silently discard records from a damaged file. */
export function parseLab(raw:any):LabBook{
  if(!raw||typeof raw.watchlist!=='string'||!Array.isArray(raw.tickets))throw new Error('The Trading Lab file is invalid. Your existing copies have been kept.');
  parseWatchlist(raw.watchlist);
  if(raw.deletedTicketIds!==undefined&&(!Array.isArray(raw.deletedTicketIds)||raw.deletedTicketIds.some((id:unknown)=>typeof id!=='string'||!id.trim())))throw new Error('The saved plan deletion list is invalid. Your existing copies have been kept.');
  const deletedTicketIds=[...new Set<string>(raw.deletedTicketIds||[])].sort();
  const deleted=new Set(deletedTicketIds);
  const ids=new Set<string>();
  const tickets=raw.tickets.map((t:any):LabTicket=>{
    if(!t||typeof t.id!=='string'||!t.id||ids.has(t.id)||typeof t.createdAt!=='string'||!Number.isFinite(Date.parse(t.createdAt))||typeof t.sourceDate!=='string'||typeof t.note!=='string'||(t.entrySource!==undefined&&typeof t.entrySource!=='string')||!t.plan||sizePlan(t.plan).errors.length||!Number.isSafeInteger(t.quantity)||t.quantity<=0)throw new Error('A saved lab plan could not be read. Your existing copies have been kept.');
    ids.add(t.id);
    const p=t.plan;
    return {id:t.id,createdAt:t.createdAt,plan:{symbol:p.symbol,entry:p.entry,stop:p.stop,target:p.target,capital:p.capital,riskPct:p.riskPct,capPct:p.capPct,feePct:p.feePct,slipPct:p.slipPct,minRR:p.minRR,lot:p.lot},quantity:t.quantity,sourceDate:t.sourceDate,note:t.note,...(t.entrySource===undefined?{}:{entrySource:t.entrySource}),...(t.workflow===undefined?{}:{workflow:parseWorkflow(t.workflow)})};
  }).sort((a:LabTicket,b:LabTicket)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  if(raw.watchlistUpdatedAt!==undefined&&!Number.isFinite(Date.parse(raw.watchlistUpdatedAt)))throw new Error('The saved watchlist date is invalid.');
  return {watchlist:raw.watchlist,tickets:tickets.filter((ticket:LabTicket)=>!deleted.has(ticket.id)),...(raw.watchlistUpdatedAt?{watchlistUpdatedAt:raw.watchlistUpdatedAt}:{}),...(deletedTicketIds.length?{deletedTicketIds}:{})};
}
export function mergeLabs(...books:LabBook[]):LabBook{
  const valid=books.map(parseLab), tickets=new Map<string,LabTicket>();
  // Keep deletion markers indefinitely: an offline device can return an old plan later.
  const deletedTicketIds=[...new Set(valid.flatMap(book=>book.deletedTicketIds||[]))].sort();
  for(const book of valid)for(const ticket of book.tickets){
    if(deletedTicketIds.includes(ticket.id))continue;
    const previous=tickets.get(ticket.id);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(ticket))throw new Error('Two versions of a lab plan differ. Export your local journal before resolving the difference.');
    tickets.set(ticket.id,ticket);
  }
  const newest=[...valid].sort((a,b)=>(b.watchlistUpdatedAt||'').localeCompare(a.watchlistUpdatedAt||'')||a.watchlist.localeCompare(b.watchlist))[0];
  return parseLab({...newest,tickets:[...tickets.values()],deletedTicketIds});
}
export function deleteLabTicket(book:LabBook,id:string):LabBook{
  const valid=parseLab(book);
  if(!valid.tickets.some(ticket=>ticket.id===id))return valid;
  return parseLab({...valid,deletedTicketIds:[...(valid.deletedTicketIds||[]),id]});
}
export function restoreLabTicket(book:LabBook,ticket:LabTicket,newId:string):LabBook{
  const valid=parseLab(book);
  if(!newId.trim()||newId===ticket.id||valid.tickets.some(t=>t.id===newId)||valid.deletedTicketIds?.includes(newId))throw new Error('The restored plan needs a new identifier.');
  // Undo creates a copy so the old deletion remains authoritative on other devices.
  return parseLab({...valid,tickets:[...valid.tickets,{...ticket,id:newId}]});
}
export function hasPendingLab(email:string){
  if(!email)return false;
  try{const raw=localStorage.getItem(labKey(email));return !!raw&&JSON.stringify(parseLab(JSON.parse(raw)))!==localStorage.getItem(labKey(email)+':synced');}catch{return true;}
}
