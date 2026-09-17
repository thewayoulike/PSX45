import React, { useEffect, useRef, useState } from 'react';
import { cancelDriveSetup, completeDriveSetup, setDriveSetupRequiredHandler } from '../services/driveStorage';

/** Only shown when Google confirms an account has no saved Drive connection. */
export function DriveSetupPrompt() {
  const [email, setEmail] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setDriveSetupRequiredHandler(setEmail);
    return () => setDriveSetupRequiredHandler(null);
  }, []);
  useEffect(() => { if (email) dialog.current?.showModal(); }, [email]);
  if (!email) return null;
  return <dialog ref={dialog} aria-labelledby="drive-setup-title" onCancel={cancelDriveSetup}
    className="w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
    <h2 id="drive-setup-title" className="text-xl font-bold">Connect Drive once</h2>
    <p className="mt-3 text-sm break-all font-medium">{email}</p>
    <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Allow PSX Tracker to remember your Drive connection so future sign-ins can open your saved portfolio without repeating this setup.</p>
    <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Your portfolio stays in your Google Drive.</p>
    <div className="mt-6 flex flex-wrap gap-3">
      <button autoFocus type="button" onClick={completeDriveSetup} className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white">Connect Google Drive</button>
      <button type="button" onClick={cancelDriveSetup} className="rounded-xl border border-slate-300 px-4 py-3 dark:border-slate-600">Cancel</button>
    </div>
  </dialog>;
}
