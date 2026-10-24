import { isolatedDriveQueue, openDriveDocuments } from '../../services/isolatedDriveDocuments';
import { labKey, mergeLabs, parseLab, readLab, writeLab, notifyLab, type LabBook } from './storage';

export async function syncLabToDrive(email:string){
  return isolatedDriveQueue(email,'trading-lab-v1',async()=>{
    const drive=await openDriveDocuments(email,'trading-lab-v1',parseLab);
    const copies=(await drive.read()).map(copy=>({...copy,value:parseLab(copy.value)}));
    // Read local data after network reads, including edits made while loading Drive.
    const raw=localStorage.getItem(labKey(email));
    if(raw)parseLab(JSON.parse(raw)); // Never overwrite a corrupt local journal with defaults.
    const local=readLab(email);
    const merged=mergeLabs(...copies.map(c=>c.value),...(raw||!copies.length?[local]:[]));
    const existing=copies.length===1?copies.find(c=>JSON.stringify(parseLab(c.value))===JSON.stringify(merged)):undefined;
    const saved=existing||await drive.save(merged,copies);
    // A new plan may have been added during the upload. Preserve it and leave it pending.
    const currentRaw=localStorage.getItem(labKey(email));
    const current=currentRaw?parseLab(JSON.parse(currentRaw)):saved.value;
    const latest:LabBook=mergeLabs(saved.value,current);
    writeLab(email,latest);
    localStorage.setItem(labKey(email)+':synced',JSON.stringify(saved.value));
    localStorage.setItem(labKey(email)+':drive',JSON.stringify({fileId:saved.fileId,savedAt:saved.savedAt}));
    notifyLab();
    return saved;
  });
}
