const base='https://raw.githubusercontent.com/thewayoulike/PSX45/codex/market-data/';
export async function fetchPublicReport(name) {
  if(!['flows','insiders'].includes(name)) throw new Error('Unknown report');
  const response=await fetch(base+name+'.json',{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
  if(!response.ok) throw new Error('Published market report unavailable');
  const data=await response.json();
  if(!data.updatedAt || (name==='flows' ? !data.date || !Array.isArray(data.cells) : !data.asOf || !Array.isArray(data.records))) throw new Error('Invalid published report');
  return data;
}
