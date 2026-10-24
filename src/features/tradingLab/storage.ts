import { sizePlan, type Plan } from './engine';
export type LabTicket={id:string;createdAt:string;plan:Plan;quantity:number;sourceDate:string;note:string;entrySource?:string};
export type LabBook={watchlist:string; tickets:LabTicket[]};
export const DEFAULT_WATCHLIST='HBL, MEBL, OGDC, PPL, HUBC, FFC, LUCK, SYS';
export const labKey=(email:string)=>'psx-trading-lab:v1:'+encodeURIComponent(email.trim().toLowerCase());
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
    return {watchlist:raw.watchlist,tickets:raw.tickets.filter((t:any)=>t&&typeof t.id==='string'&&typeof t.createdAt==='string'&&typeof t.sourceDate==='string'&&typeof t.note==='string'&&(t.entrySource===undefined||typeof t.entrySource==='string')&&t.plan&&sizePlan(t.plan).errors.length===0&&Number.isSafeInteger(t.quantity)&&t.quantity>0).slice(0,100)};
  }catch{return fallback;}
}
export function writeLab(email:string,book:LabBook,storage:Pick<Storage,'setItem'>=localStorage){
  if(!email)throw new Error('Sign in before saving lab plans.');
  parseWatchlist(book.watchlist);
  if(book.tickets.length>100)throw new Error('The lab holds 100 plans. Export your journal before starting a new test.');
  storage.setItem(labKey(email),JSON.stringify(book));
}
