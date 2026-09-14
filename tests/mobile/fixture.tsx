// Local-only synthetic data. This entry is excluded from the production build.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { Dashboard } from '../../src/components/DashboardStats';
import { DashboardGrid } from '../../src/components/DashboardGrid';
import { AllocationChart } from '../../src/components/AllocationChart';
import { PerformanceChart } from '../../src/components/PerformanceChart';
import { StockChart, CandleChart } from '../../src/components/StockChart';
import { Sidebar } from '../../src/components/Sidebar';
import { ChartsExplorer } from '../../src/components/ChartsExplorer';
import { loadChartSettings } from '../../src/services/chartSettingsStorage';
import { useMediaQuery } from '../../src/hooks/useMediaQuery';
const noop = () => {};
const holdings = ['Oil and Gas Exploration Companies', 'Commercial Banks', 'Technology and Communication', 'Fertilizer'].map((sector, i) => ({ticker:['OGDC','MEBL','SYS','FFC'][i],sector,quantity:10000,currentPrice:200+i*40,avgPrice:180,totalCommission:0,totalTax:0,totalCDC:0,totalOtherFees:0}));
const stats:any = Object.fromEntries(['totalValue','totalCost','unrealizedPL','unrealizedPLPercent','realizedPL','netRealizedPL','totalDividends','totalDividendTax','dailyPL','dailyPLPercent','totalCommission','totalSalesTax','totalCDC','totalOtherFees','totalCGT','freeCash','cashInvestment','totalDeposits','netPrincipal','peakNetPrincipal','reinvestedProfits','roi','mwrr'].map(k=>[k,0]));
Object.assign(stats,{totalValue:123456789.25,totalCost:100000000,netPrincipal:100000000,peakNetPrincipal:100000000,unrealizedPL:23456789.25,roi:23.46,dailyPL:1234567.89});
const performance=Array.from({length:30},(_,i)=>({date:`2026-08-${String(i+1).padStart(2,'0')}`,Portfolio:-20+i*2,KSE100:i*0.5,KMI30:-i*0.3}));
const bars=Array.from({length:60},(_,i)=>({date:`2026-07-${String(i%28+1).padStart(2,'0')}`,time:Date.UTC(2026,6,i+1),open:100+i/2,close:101+i/2+Math.sin(i)*2,high:104+i/2,low:97+i/2,volume:10000+i*300}));
function Fixture(){
 const [view,setView]=useState('Dashboard'),[open,setOpen]=useState(false),[dark,setDark]=useState(false);
 const phone=useMediaQuery('(max-width: 767px)'),settings=loadChartSettings();
 const cards=['stats','allocation','performance'];
 return <div className={dark?'dark':''}><div style={{minHeight:'100vh',padding:12,background:dark?'#0f172a':'#f1f5f9'}}>
 <nav style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>{['Dashboard','Allocation','Performance','Candles','Tools','Explorer'].map(x=><button key={x} onClick={()=>setView(x)}>{x}</button>)}<button onClick={()=>setOpen(true)}>Open menu</button><button onClick={()=>setDark(!dark)}>Toggle theme</button></nav>
 <Sidebar currentView="DASHBOARD" onViewChange={noop} isOpen={open} onClose={()=>setOpen(false)} isSidebarCollapsed={false} onToggleCollapse={noop} driveUser={null} onLogin={noop} onLogout={noop} isCloudSyncing={false} hasApiKeys={false}/>
 <div style={{marginLeft:!phone&&innerWidth>=1024?256:0}}>
 {view==='Dashboard'&&<DashboardGrid device={phone?'mobile':'web'} layout={cards.map((id,i)=>({id,visible:true,x:0,y:i*30,w:phone?1:12,h:30}))} renderCard={id=>id==='stats'?<Dashboard stats={stats} holdings={holdings}/>:id==='allocation'?<AllocationChart holdings={holdings}/>:<PerformanceChart transactions={[]} savedData={performance} onSaveData={noop}/>}/>}
 {view==='Allocation'&&<AllocationChart holdings={holdings}/>}
 {view==='Performance'&&<PerformanceChart transactions={[]} savedData={performance} onSaveData={noop}/>}
 {view==='Tools'&&<StockChart symbol={null}/>}
 {view==='Explorer'&&<div style={{height:'calc(100dvh - 180px)',display:'flex'}}><ChartsExplorer previewMode/></div>}
 {view==='Candles'&&<CandleChart bars={bars} layers={settings.layers} momentumConfig={settings.momentumConfig} momentumSeries={[]} atrSeries={[]} awaisLayers={settings.awaisLayers} height={320}/>}
 </div></div></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

