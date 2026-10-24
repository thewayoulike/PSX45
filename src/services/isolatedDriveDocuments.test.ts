import {expect,it,vi} from 'vitest';
vi.mock('./driveStorage',()=>({cloudSession:vi.fn()}));
import {openDriveDocuments} from './isolatedDriveDocuments';
const response=(body:unknown)=>new Response(JSON.stringify(body));
const owner='lab@example.test',kind='trading-lab-v1' as const;
const envelope=(data:unknown)=>({version:1,kind,owner,data});
const parse=(x:any)=>{if(!Array.isArray(x?.ids))throw new Error('Invalid journal');return {ids:x.ids};};
function fakeDrive(){
  let count=0;
  const files=new Map<string,any>();
  const retired:string[]=[];
  const request=vi.fn(async(url:string,init?:RequestInit)=>{
    if(url.includes('/upload/')){const id='new-'+(++count);const body=JSON.parse(await ((init!.body as FormData).get('file') as Blob).text());files.set(id,body);return response({id,createdTime:'2026-10-24T15:00:00Z'});}
    const id=url.split('/files/')[1]?.split('?')[0];
    if(init?.method==='PATCH'){retired.push(id!);return response({});}
    if(url.includes('alt=media'))return response(files.get(id!));
    return response({files:[...files.keys()].filter(id=>!retired.includes(id)).map(id=>({id,createdTime:'2026-10-24T14:00:00Z'}))});
  });
  return {files,retired,request,open:async()=>request};
}
it('keeps an unseen concurrent device save while retiring only incorporated input',async()=>{
  const fake=fakeDrive();fake.files.set('old',envelope({ids:['a']}));
  const drive=await openDriveDocuments(owner,kind,parse,fake.open),observed=await drive.read();
  fake.files.set('concurrent',envelope({ids:['a','b']}));
  await drive.save({ids:['a','c']},observed);
  expect(fake.retired).toEqual(['old']);
  const remaining=await drive.read();expect(remaining.map(x=>x.value.ids)).toEqual([['a','b'],['a','c']]);
});
it('never retires the previous backup after an unverified upload',async()=>{
  const fake=fakeDrive();fake.files.set('old',envelope({ids:['a']}));
  const request=async(url:string,init?:RequestInit)=>url.includes('/new-1?alt=media')?response(envelope({ids:['damaged']})):fake.request(url,init);
  const drive=await openDriveDocuments(owner,kind,parse,async()=>request);
  await expect(drive.save({ids:['a','b']},await drive.read())).rejects.toThrow('verified');
  expect(fake.retired).toEqual([]);
});
it('rejects files from another account or a malformed journal',async()=>{
  const fake=fakeDrive();fake.files.set('other',{...envelope({ids:[]}),owner:'other@example.test'});
  const drive=await openDriveDocuments(owner,kind,parse,fake.open);
  await expect(drive.read()).rejects.toThrow('different account');
  fake.files.set('other',envelope({broken:true}));await expect(drive.read()).rejects.toThrow('Invalid journal');
  expect(fake.retired).toEqual([]);
});
it('reads every Drive listing page and keeps two prior practice backup files',async()=>{
  const fake=fakeDrive();for(const id of ['a','b','c'])fake.files.set(id,envelope({ids:[id]}));
  const request=async(url:string,init?:RequestInit)=>{
    if(init?.method||!url.includes('/files?'))return fake.request(url,init);
    return response(url.includes('pageToken=next')?{files:[{id:'c'}]}:{files:[{id:'a'},{id:'b'}],nextPageToken:'next'});
  };
  const drive=await openDriveDocuments(owner,kind,parse,async()=>request),observed=await drive.read();
  expect(observed).toHaveLength(3);await drive.save({ids:['new']},observed,2);expect(fake.retired).toEqual(['c']);
});
