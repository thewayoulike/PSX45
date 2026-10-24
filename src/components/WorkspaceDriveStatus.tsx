import React from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { driveDocumentLink } from '../services/isolatedDriveDocuments';
import './workspace-drive.css';
export type WorkspaceDriveState={busy:boolean;error:string;savedAt?:string;fileId?:string};
export function WorkspaceDriveStatus({connected,onConnect,onSync,state,pending=false,practice=false}:{connected:boolean;onConnect?:()=>void;onSync:()=>void;state:WorkspaceDriveState;pending?:boolean;practice?:boolean}){
  const label=practice?'Practice Trading backup':'Trading Lab Drive save';
  return <aside className="workspace-drive" aria-label={label}>
    <Cloud size={19}/><div className="workspace-drive-copy"><strong>{label}</strong><p role="status">{state.busy?(practice?'Backing up all orders and positions…':'Saving and checking your journal…'):state.error?state.error:!connected?'Connect Google Drive to save a separate copy under your login.':pending?'Saved on this device · Waiting to save to Drive':state.savedAt?`Saved to Drive · ${new Date(state.savedAt).toLocaleString()}`:'Ready to save to Google Drive'}</p><small>{practice?'Automatic backup on opening this page, after trades, and every 5 minutes while open. pyPSX keeps the active practice account.':'Saved plans, notes and your scanned watchlist sync when this page is open. A local copy stays on this device.'}</small></div>
    <div className="workspace-drive-actions">{!connected?onConnect&&<button onClick={onConnect}>Connect Google Drive</button>:<button disabled={state.busy} onClick={onSync}><RefreshCw size={14}/>{state.busy?'Saving…':practice?'Back up now':'Sync now'}</button>}{connected&&state.fileId&&<a href={driveDocumentLink(state.fileId)} target="_blank" rel="noopener noreferrer">Open Drive copy ↗</a>}</div>
  </aside>;
}
