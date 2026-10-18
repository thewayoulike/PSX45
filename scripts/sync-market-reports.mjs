import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCompanies, parseInsiders, normalizeFlows, readPublic, flowSource, insiderSource } from './market-reports.mjs';

const output = path.resolve(process.argv[2] || '.market-data');
await fs.mkdir(output,{recursive:true});
const now = new Date(), updatedAt = now.toISOString();
const today = new Date(now.getTime()+5*3600000).toISOString().slice(0,10);
const previous = async name => { try { return JSON.parse(await fs.readFile(path.join(output,name+'.json'),'utf8')); } catch(error) { if(error.code==='ENOENT') return null; throw error; } };
const save = async (name,data) => { await fs.writeFile(path.join(output,name+'.json.tmp'),JSON.stringify(data)); await fs.rename(path.join(output,name+'.json.tmp'),path.join(output,name+'.json')); };
let failures = 0;
try {
  const old = await previous('flows'); let report;
  for(let offset=0;offset<10;offset++) {
    const date = new Date(Date.parse(today+'T00:00:00Z')-offset*86400000).toISOString().slice(0,10);
    if (old?.date && date < old.date) break;
    const [y,m,d]=date.split('-'), providerDate=`${m}/${d}/${y}`;
    const response = await readPublic(flowSource+'/loadfipisector',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8',Accept:'application/json'},body:JSON.stringify({date1:providerDate,date2:providerDate})});
    const raw = (await response.json()).d;
    if (Array.isArray(raw) && raw.length===0) continue;
    report = {...normalizeFlows(raw,date),updatedAt}; break;
  }
  if (!report && !old) throw new Error('No recent investor report');
  if (report) await save('flows',report);
  console.log(`Investor flows: ${report?.date || old.date}`);
} catch(error) { failures++; console.error('Investor flows unchanged:',error.message); }

try {
  const old = await previous('insiders');
  const companies = parseCompanies(await (await readPublic(insiderSource)).text());
  if (companies.length < 400) throw new Error('Incomplete company universe');
  const cutoff = new Date(Date.UTC(Number(today.slice(0,4))-1,Number(today.slice(5,7))-1,1)).toISOString().slice(0,10);
  const records = new Map((old?.records || []).filter(r=>r.date>=cutoff && r.date<=today).map(r=>[r.id,r]));
  const cacheDir=path.join(output,'.fetch-cache');await fs.mkdir(cacheDir,{recursive:true});
  let checked=0,index=0;const failed=[];
  async function worker() {
    while(index<companies.length) {
      const company=companies[index++];
      try {
        const cacheFile=path.join(cacheDir,company.symbol+'.json');let cached;
        try{cached=JSON.parse(await fs.readFile(cacheFile,'utf8'));}catch{}
        let parsed;
        if(cached?.day===today) parsed=cached.records;
        else {
          const html = await (await readPublic(`https://www.scstrade.com/stockscreening/SS_CompanySnapShot.aspx?symbol=${company.symbol}`)).text();
          parsed=parseInsiders(html,company);await fs.writeFile(cacheFile,JSON.stringify({day:today,records:parsed}));
        }
        // Replace refreshed disclosure groups so corrected values don't double-count.
        const refreshed=new Set(parsed.map(r=>r.sourceUrl));
        for(const [id,row] of records) if(row.symbol===company.symbol&&refreshed.has(row.sourceUrl)) records.delete(id);
        for(const row of parsed) if(row.date>=cutoff && row.date<=today) records.set(row.id,row);
        checked++;
      } catch(error) { failed.push(company.symbol);if(failed.length<=10)console.error(`${company.symbol}: ${error.message}`); }
      if ((checked+failed.length)%100===0) console.log(`Insider companies checked: ${checked+failed.length}/${companies.length}`);
    }
  }
  await Promise.all([worker(),worker()]);
  if(checked<companies.length*.90 || (old && checked<old.checked*.98) || records.size<50) throw new Error(`Incomplete refresh: ${checked}/${companies.length} companies`);
  const data={updatedAt,asOf:today,sourceUrl:insiderSource,coverage:'Latest five source records per company, plus records retained from earlier daily updates. Historical coverage is partial.',companies:companies.length,checked,failed,records:[...records.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.symbol.localeCompare(b.symbol))};
  await save('insiders',data);
  console.log(`Insiders: ${data.records.length} available records, ${checked}/${companies.length} companies`);
} catch(error) { failures++; console.error('Insiders unchanged:',error.message); }
// A failed source never replaces its previous file. Publish other successful updates.
if(failures) process.exitCode=1;
