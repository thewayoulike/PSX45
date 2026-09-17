import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let storage: Map<string, string>;
let service: typeof import('./driveStorage');
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function pendingKey(email: string) {
  return 'psx_pending_cloud_v1:' + encodeURIComponent(email);
}

async function login(email = 'a@example.com') {
  storage.set('psx_drive_access_token', 'test-token');
  storage.set('psx_drive_user_profile', JSON.stringify({ email }));
  storage.set('psx_drive_token_expiry', String(Date.now() + 3600000));
  service.initDriveAuth(() => {});
}

function mockCloud(handlers: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => handlers(String(url), init)));
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  vi.stubGlobal('document', { getElementById: () => true, createElement: () => ({ click() {}, set href(_v: string) {}, set download(_v: string) {} }) });
  vi.stubGlobal('window', { URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} } });
  service = await import('./driveStorage');
  await login();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cloud save outcomes and recovery', () => {
  it('renews expired Drive access after password login without opening a Google popup', async () => {
    const provider=vi.fn().mockResolvedValue({connected:true,accessToken:'renewed',expiresIn:3600,user:{email:'a@example.com',name:'A',picture:''}});
    service.setDrivePasswordProviders(async()=>({email:'a@example.com',token:'password-token'}),provider);
    await vi.advanceTimersByTimeAsync(3600001);
    expect(await Promise.all([service.getValidToken(),service.getValidToken()])).toEqual(['renewed','renewed']);
    expect(provider).toHaveBeenCalledTimes(1);expect(storage.get('psx_drive_access_token')).toBe('renewed');
  });
  it('ignores a renewed token if the user signs out while it is loading', async () => {
    let resolve!:(v:any)=>void;
    service.setDrivePasswordProviders(null,()=>new Promise(r=>{resolve=r;}));
    await vi.advanceTimersByTimeAsync(3600001);
    const pending=service.getValidToken();service.clearDriveSession();
    resolve({connected:true,accessToken:'obsolete',expiresIn:3600,user:{email:'a@example.com',name:'A',picture:''}});
    expect(await pending).toBeNull();expect(storage.has('psx_drive_access_token')).toBe(false);
  });
  it('rejects server sessions for another email before replacing the active identity', async () => {
    expect(()=>service.installLinkedDriveSession({connected:true,accessToken:'wrong',expiresIn:3600,user:{email:'b@example.com',name:'B',picture:''}},'a@example.com')).toThrow('does not match');
    expect(storage.get('psx_drive_access_token')).toBe('test-token');
  });
  it('exchanges a Google authorization code with the same password identity and never stores a refresh credential', async () => {
    let callback!:(response:any)=>Promise<void>;
    const requestCode=vi.fn(),onLogin=vi.fn(),initCodeClient=vi.fn((opts:any)=>{callback=opts.callback;return {requestCode};});
    vi.stubGlobal('window',{google:{accounts:{oauth2:{initCodeClient}}}});
    service.initDriveAuth(onLogin);onLogin.mockClear();
    service.setDrivePasswordProviders(async()=>({email:'a@example.com',token:'password-token'}),null);
    mockCloud((_url,init)=>JSON.parse(String(init?.body)).action==='drive-config'
      ? response({enabled:true,clientId:'web-client'})
      : response({connected:true,accessToken:'linked-google-token',expiresIn:3600,user:{email:'a@example.com',name:'A',picture:''}}));
    await service.getRememberedDriveConfig();service.signInWithDrive('a@example.com');
    expect(requestCode).toHaveBeenCalledOnce();expect(initCodeClient).toHaveBeenCalledWith(expect.objectContaining({ux_mode:'popup',login_hint:'a@example.com',include_granted_scopes:false}));
    await callback({code:'one-time-code'});
    expect(fetch).toHaveBeenLastCalledWith('/api/cloud-sync',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer password-token','X-Requested-With':'PSXTracker'}),body:JSON.stringify({action:'drive-connect',code:'one-time-code',expectedEmail:'a@example.com'})}));
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({email:'a@example.com'}));expect(storage.get('psx_drive_access_token')).toBe('linked-google-token');
    expect([...storage.keys()].some(k=>k.includes('refresh'))).toBe(false);
  });
  it('hints the password email and rejects another Google account before changing the Drive identity', async () => {
    let callback!:(response:any)=>Promise<void>;
    const requestAccessToken=vi.fn(), onLogin=vi.fn();
    vi.stubGlobal('alert',vi.fn());
    vi.stubGlobal('window',{google:{accounts:{oauth2:{initTokenClient:(options:any)=>{callback=options.callback;return {requestAccessToken};}}}}});
    service.initDriveAuth(onLogin); onLogin.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    mockCloud(()=>response({enabled:false}));await service.getRememberedDriveConfig();
    service.signInWithDrive(' A@example.com ');
    expect(requestAccessToken).toHaveBeenCalledWith({prompt:'',login_hint:'a@example.com'});
    mockCloud(()=>response({email:'b@example.com',email_verified:true,name:'B'}));
    await callback({access_token:'wrong-account-token',expires_in:3600});
    expect(onLogin).not.toHaveBeenCalled();
    expect(storage.get('psx_drive_access_token')).toBe('test-token');
    expect(JSON.parse(storage.get('psx_drive_user_profile')!).email).toBe('a@example.com');
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('same Google account'));
  });
  it('connects the matching verified Google identity after password login', async () => {
    let callback!:(response:any)=>Promise<void>;
    const onLogin=vi.fn();
    vi.stubGlobal('window',{google:{accounts:{oauth2:{initTokenClient:(options:any)=>{callback=options.callback;return {requestAccessToken:vi.fn()};}}}}});
    service.initDriveAuth(onLogin); onLogin.mockClear();
    await vi.advanceTimersByTimeAsync(500);
    mockCloud(()=>response({enabled:false}));await service.getRememberedDriveConfig();
    service.signInWithDrive('a@example.com');
    mockCloud(()=>response({email:'A@example.com',email_verified:true,name:'Existing member'}));
    await callback({access_token:'same-account-token',expires_in:3600});
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({email:'a@example.com'}));
    expect(storage.get('psx_drive_access_token')).toBe('same-account-token');
  });
  it('exposes pending revision metadata and can clear it', async () => {
    storage.set(pendingKey('a@example.com'), JSON.stringify({
      revision: 'a3f9c21e-1234-5678-9abc-def012345678',
      queuedAt: '2026-09-17T14:00:00.000Z',
      data: { marker: 'local' },
    }));
    const pending = service.getPendingCloud();
    expect(pending).toMatchObject({
      revision: 'a3f9c21e-1234-5678-9abc-def012345678',
      queuedAt: '2026-09-17T14:00:00.000Z',
      data: { marker: 'local' },
    });
    service.clearPendingCloud();
    expect(service.getPendingCloud()).toBeNull();
  });

  it('records queuedAt when a save becomes pending', async () => {
    mockCloud((url) => {
      if (url.includes('/api/cloud-sync')) return response({ revision: 0, fileId: null });
      if (url.includes('/upload/')) return response({}, 500);
      return response({ files: [] });
    });
    await service.loadFromDrive();
    const result = await service.saveToDrive({ marker: 1 });
    expect(result.ok).toBe(false);
    const pending = service.getPendingCloud();
    expect(pending?.revision).toMatch(/^[0-9a-f-]{36}$/i);
    expect(pending?.queuedAt).toBeTruthy();
    expect(pending?.data).toMatchObject({ marker: 1 });
  });

  it.each([401, 403, 429, 500])('retains pending changes after HTTP %s on upload', async (status) => {
    mockCloud((url) => {
      if (url.includes('/api/cloud-sync')) return response({ revision: 0, fileId: null });
      if (url.includes('/upload/')) return response({}, status);
      return response({ files: [] });
    });
    await service.loadFromDrive();
    expect((await service.saveToDrive({ transactions: [1] })).ok).toBe(false);
    expect(service.getPendingCloud()?.data).toMatchObject({ transactions: [1] });
  });

  it('recovers pending snapshots for the same account on load', async () => {
    storage.set(pendingKey('a@example.com'), JSON.stringify({
      revision: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      queuedAt: '2026-09-17T14:00:00.000Z',
      baseVersion: 0,
      fileId: 'db',
      data: { marker: 'pending' },
    }));
    mockCloud((url) => {
      if (url.includes('/api/cloud-sync')) return response({ revision: 0, fileId: 'db' });
      return response({ files: [{ id: 'db' }] });
    });
    expect(await service.loadFromDrive()).toMatchObject({ marker: 'pending' });
  });

  it('rejects a stale device before uploading and preserves the local snapshot', async () => {
    let revision = 0, uploads = 0;
    mockCloud(url => {
      if (url.includes('/api/cloud-sync')) return response({revision,fileId:revision ? 'new-device-file' : null});
      if (url.includes('/upload/')) uploads++;
      return response({files:[]});
    });
    await service.loadFromDrive(); revision = 1;
    const saved = await service.saveToDrive({transactions:[{id:'local-trade'}]});
    expect(saved.ok).toBe(false); expect(uploads).toBe(0);
    expect(service.getPendingCloud()?.data.transactions[0].id).toBe('local-trade');
  });

  it('a concurrent commit after preflight cannot overwrite the winner', async () => {
    let remote = {revision:0,fileId:null as string|null}, commitCount=0;
    mockCloud((url, init) => {
      if (url.includes('/api/cloud-sync')) {
        const body=JSON.parse(String(init?.body));
        if (body.action==='commit') { commitCount++; remote={revision:1,fileId:'other-device-file'}; return response({...remote,conflict:true},409); }
        return response(remote);
      }
      if (url.includes('/upload/')) { expect(init?.method).toBe('POST'); return response({id:'local-candidate-file'}); }
      return response({files:[]});
    });
    await service.loadFromDrive();
    expect((await service.saveToDrive({marker:'local'})).ok).toBe(false);
    expect(commitCount).toBe(1); expect(remote.fileId).toBe('other-device-file');
    expect(service.getPendingCloud()?.fileId).toBe('local-candidate-file');
    await expect(service.loadFromDrive()).rejects.toThrow('Another device');
  });

  it('serializes local saves and preserves the newest pending revision', async () => {
    let head={revision:0,fileId:null as string|null}, finish!:()=>void, uploads=0;
    mockCloud(async (url,init) => {
      if (url.includes('/api/cloud-sync')) {
        const b=JSON.parse(String(init?.body));
        if (b.action==='commit') head={revision:head.revision+1,fileId:b.fileId};
        return response(head);
      }
      if (url.includes('/upload/')) { uploads++; if(uploads===1) await new Promise<void>(r=>{finish=r;}); return response({id:`snapshot-file-${uploads}`}); }
      return response({files:[]});
    });
    await service.loadFromDrive();
    const first=service.saveToDrive({marker:1}); const second=service.saveToDrive({marker:2});
    await vi.waitFor(()=>expect(uploads).toBe(1));
    expect(service.getPendingCloud()?.data.marker).toBe(2); finish();
    expect((await first).ok).toBe(true); expect((await second).ok).toBe(true);
    expect(head.revision).toBe(2); expect(service.getPendingCloud()).toBeNull();
  });

  it('recovers a committed snapshot after an ambiguous network response', async () => {
    storage.set(pendingKey('a@example.com'),JSON.stringify({revision:'pending',baseVersion:1,fileId:'snapshot-file',data:{marker:'recover'}}));
    mockCloud(()=>response({revision:2,fileId:'snapshot-file'}));
    expect(await service.loadFromDrive()).toMatchObject({marker:'recover'});
  });

  it('an account switch cannot commit or load another account’s pending data', async () => {
    storage.set(pendingKey('a@example.com'),JSON.stringify({revision:'a',baseVersion:0,data:{marker:'private-a'}}));
    await login('b@example.com');
    mockCloud(url => url.includes('/api/cloud-sync') ? response({revision:0,fileId:null}) : response({files:[]}));
    expect(service.getPendingCloud()).toBeNull(); expect(await service.loadFromDrive()).toBeNull();
    expect(storage.has(pendingKey('a@example.com'))).toBe(true);
  });

  it('Restore retains pending data if cloud cannot be read, then archives it before reloading', async () => {
    storage.set(pendingKey('a@example.com'),JSON.stringify({revision:'restore',baseVersion:0,data:{marker:'local'}}));
    const reload=vi.fn(); vi.stubGlobal('window',{location:{reload}}); vi.stubGlobal('alert',vi.fn());
    mockCloud(()=>response({},503));
    await service.preservePendingAndReloadCloud(); expect(reload).not.toHaveBeenCalled(); expect(service.getPendingCloud()).not.toBeNull();
    mockCloud(url => url.includes('/api/cloud-sync') ? response({revision:1,fileId:'remote-file'}) : response({transactions:[],portfolios:[],marker:'remote'}));
    await service.preservePendingAndReloadCloud();
    expect(reload).toHaveBeenCalledOnce(); expect(service.getPendingCloud()).toBeNull();
    const recovery=[...storage.entries()].find(([key])=>key.startsWith('psx_cloud_recovery:'));
    expect(JSON.parse(recovery![1]).data.marker).toBe('local');
  });

  it('Keep pending downloads the pending snapshot without deleting it', () => {
    storage.set(pendingKey('a@example.com'),JSON.stringify({revision:'download',data:{marker:'local'}}));
    const click=vi.fn(); const link={click,href:'',download:''};
    vi.stubGlobal('document',{createElement:()=>link});
    const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test');
    service.downloadPendingCloudBackup();
    expect(click).toHaveBeenCalledOnce(); expect(link.download).toBe('psx-unsynced-backup.json');
    expect(service.getPendingCloud()).not.toBeNull(); create.mockRestore();
  });
  it('cancels an in-flight save when the active Google account changes',async()=>{
    let finish!:()=>void, uploading=false, commits=0;
    mockCloud(async(url,init)=>{
      if(url.includes('/api/cloud-sync')){if(JSON.parse(String(init?.body)).action==='commit')commits++;return response({revision:0,fileId:null});}
      if(url.includes('/upload/')){uploading=true;await new Promise<void>(resolve=>{finish=resolve;});return response({id:'snapshot-file-A'});}
      return response({files:[]});
    });
    await service.loadFromDrive();const saving=service.saveToDrive({marker:'private-a'});
    await vi.waitFor(()=>expect(uploading).toBe(true));await login('b@example.com');finish();
    expect((await saving).ok).toBe(false);expect(commits).toBe(0);expect(service.getPendingCloud()).toBeNull();
    expect(storage.get(pendingKey('a@example.com'))).toContain('private-a');
  });
  it('Restore never clears pending changes when no remote backup exists',async()=>{
    storage.set(pendingKey('a@example.com'),JSON.stringify({revision:'local',baseVersion:0,data:{marker:'only-copy'}}));
    const reload=vi.fn();vi.stubGlobal('window',{location:{reload}});vi.stubGlobal('alert',vi.fn());
    mockCloud(url=>url.includes('/api/cloud-sync')?response({revision:0,fileId:null}):response({files:[]}));
    await service.preservePendingAndReloadCloud();expect(reload).not.toHaveBeenCalled();expect(service.getPendingCloud()?.data.marker).toBe('only-copy');
  });
  it('loads the phone backup after a web conflict and keeps both pending and current web edits', async () => {
    const remote = {transactions:[{id:'phone-trade'}],portfolios:[{id:'main'}]};
    storage.set(pendingKey('a@example.com'),JSON.stringify({revision:'old-web',baseVersion:0,data:{transactions:[{id:'old-web-trade'}],portfolios:[]}}));
    const reload=vi.fn(); vi.stubGlobal('window',{location:{reload}}); vi.stubGlobal('alert',vi.fn());
    mockCloud(url => url.includes('/api/cloud-sync') ? response({revision:2,fileId:'phone-snapshot'}) : response(remote));
    await expect(service.loadFromDrive()).rejects.toThrow('Another device');
    expect(await service.preservePendingAndReloadCloud(() => ({transactions:[{id:'new-web-trade'}],portfolios:[]}))).toBe(true);
    const recoveries=[...storage].filter(([key])=>key.startsWith('psx_cloud_recovery:')).map(([,value])=>JSON.parse(value).data);
    expect(recoveries).toHaveLength(2);
    expect(recoveries.map(data=>data.transactions[0].id).sort()).toEqual(['new-web-trade','old-web-trade']);
    expect(reload).toHaveBeenCalledOnce();
    expect(await service.loadFromDrive()).toEqual(remote);
    expect(vi.mocked(fetch).mock.calls.every(([,init])=> !init?.body || JSON.parse(String(init.body)).action === 'head')).toBe(true);
  });
  it.each([null, {}, {transactions:[],portfolios:'broken'}])('keeps pending data if the remote backup is invalid: %j', async data => {
    storage.set(pendingKey('a@example.com'),JSON.stringify({revision:'web',data:{marker:'keep'}}));
    const reload=vi.fn(); vi.stubGlobal('window',{location:{reload}}); vi.stubGlobal('alert',vi.fn());
    mockCloud(url=>url.includes('/api/cloud-sync')?response({revision:1,fileId:'remote-file'}):response(data));
    expect(await service.preservePendingAndReloadCloud()).toBe(false);
    expect(reload).not.toHaveBeenCalled(); expect(service.getPendingCloud()?.data.marker).toBe('keep');
  });
  it('stops loading latest if a local recovery copy cannot be stored', async () => {
    storage.set(pendingKey('a@example.com'),JSON.stringify({revision:'web',data:{marker:'keep'}}));
    const reload=vi.fn(); vi.stubGlobal('window',{location:{reload}}); vi.stubGlobal('alert',vi.fn());
    mockCloud(url=>url.includes('/api/cloud-sync')?response({revision:1,fileId:'remote-file'}):response({transactions:[],portfolios:[]}));
    vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});
    expect(await service.preservePendingAndReloadCloud(()=>({transactions:[],portfolios:[]}))).toBe(false);
    expect(reload).not.toHaveBeenCalled(); expect(service.getPendingCloud()?.data.marker).toBe('keep');
  });
  it('pauses new saves while loading latest and captures edits made during the download', async () => {
    const reload=vi.fn(); vi.stubGlobal('window',{location:{reload}}); vi.stubGlobal('alert',vi.fn());
    let finish!:(value:Response)=>void, downloading=false, current='before';
    mockCloud(async url=>{
      if(url.includes('/api/cloud-sync')) return response({revision:1,fileId:'remote-file'});
      downloading=true; return new Promise<Response>(resolve=>{finish=resolve;});
    });
    const loading=service.preservePendingAndReloadCloud(()=>({marker:current}));
    await vi.waitFor(()=>expect(downloading).toBe(true));
    expect((await service.saveToDrive({marker:'must-not-upload'})).ok).toBe(false);
    expect(service.getPendingCloud()).toBeNull();
    current='after'; finish(response({transactions:[],portfolios:[]}));
    expect(await loading).toBe(true);
    const recovery=[...storage].find(([key])=>key.endsWith(':current'));
    expect(JSON.parse(recovery![1]).data.marker).toBe('after');
  });
  it('does not clear the next account’s pending data when switching during a cloud download', async () => {
    storage.set(pendingKey('a@example.com'),JSON.stringify({revision:'a',data:{marker:'keep-a'}}));
    storage.set(pendingKey('b@example.com'),JSON.stringify({revision:'b',data:{marker:'keep-b'}}));
    const reload=vi.fn(); vi.stubGlobal('window',{location:{reload}}); vi.stubGlobal('alert',vi.fn());
    mockCloud(url=>url.includes('/api/cloud-sync')?response({revision:1,fileId:'remote-file'}):({
      ok:true,json:async()=>{await login('b@example.com');return {transactions:[],portfolios:[]};},
    } as Response));
    expect(await service.preservePendingAndReloadCloud()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(storage.get(pendingKey('a@example.com'))).toContain('keep-a');
    expect(service.getPendingCloud()?.data.marker).toBe('keep-b');
  });
});
