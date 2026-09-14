import React from 'react';
import { createRoot } from 'react-dom/client';
import { Logo } from '../../src/components/ui/Logo';
import '../../src/index.css';

function Fixture() {
  return <main style={{padding:20, background:'#f1f5f9', minHeight:'100vh'}}>
    <h1 style={{fontSize:22,fontWeight:700,marginBottom:20}}>Premium Badge · app components</h1>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:20}}>
      {[false,true].map(dark => <section key={String(dark)} className={dark?'dark':''} style={{background:dark?'#0f172a':'white',padding:24,borderRadius:16,display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
        <Logo />
        <Logo variant="horizontal"/>
        <Logo variant="icon"/>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <img src="/favicon.ico" width="16" height="16" alt="16px favicon"/>
          <img src="/favicon-32.png" width="32" height="32" alt="32px favicon"/>
          <img src={dark?'/brand/premium-icon-dark.png':'/pwa-premium-192.png'} width="80" height="80" alt="Install icon"/>
        </div>
      </section>)}
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
