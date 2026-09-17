// Local UI fixture, never included in the app's production entrypoints.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../../src/components/Sidebar';
import { SuggestionsPage } from '../../src/components/SuggestionsPage';
import { ProfilePage } from '../../src/components/ProfilePage';
import { GooglePasswordSetup } from '../../src/components/GooglePasswordSetup';
import { useTheme } from '../../src/hooks/useTheme';
import '../../src/index.css';
function Fixture() {
  const {toggleTheme}=useTheme();
  const [collapsed,setCollapsed]=useState(false), [event,setEvent]=useState('No action yet');
  if (window.location.search.includes('suggestions')) return <SuggestionsPage/>;
  if (window.location.search.includes('profile')) return <><button className="p-3 border dark:text-white" onClick={toggleTheme}>Toggle theme preview</button><ProfilePage email="test@example.invalid" name="Test Member" googleConnected/></>;
  if (window.location.search.includes('password-prompt')) return <GooglePasswordSetup email="test@example.invalid"/>;
  return <div className="flex h-screen bg-slate-100"><Sidebar currentView="DASHBOARD" onViewChange={()=>{}} isOpen={!collapsed} onClose={()=>{}} isSidebarCollapsed={collapsed} onToggleCollapse={()=>setCollapsed(!collapsed)} driveUser={{name:'Test Member',email:'test@example.invalid'}} onLogin={()=>{}} onLogout={()=>{}} isCloudSyncing={false} cloudSyncError="Cloud request failed (HTTP 429). Your changes remain unsynced. Please retry or sign in again." lastCloudSave={null} pendingRevision="a3f9c21e-1234-5678-9abc-def012345678" pendingQueuedAt={new Date(Date.now()-180000).toISOString()} onCloudRetry={()=>setEvent('Retry clicked')} onDownloadPending={()=>setEvent('Download clicked')} onLoadCloud={()=>setEvent('Restore confirmed')} hasApiKeys={false}/><main className="p-6"><h1>Sidebar checks · synthetic data</h1><p role="status">{event}</p><button className="p-3 border" onClick={()=>setCollapsed(!collapsed)}>Toggle collapsed preview</button></main></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
