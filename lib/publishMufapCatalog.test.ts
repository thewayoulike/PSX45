import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { publishCatalog } from '../scripts/publish-mufap-catalog.mjs';

const roots: string[]=[];
const files=['data/fund-nav-catalog.json','data/fund-nav-previous.json','public/data/fund-nav-catalog.json'];
const git=(cwd:string,...args:string[])=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const payload=(day:string)=>({count:60,updatedAt:`${day}T12:00:00Z`,today:day,reportDate:day,previousReportDate:null,yesterday:'2026-10-20',previousNavs:{},catalog:Object.fromEntries(Array.from({length:60},(_,i)=>[`MF:${i}`,{id:`MF:${i}`,nav:10,validityDate:day}]))});
function writeCatalog(cwd:string,day:string) {
  for(const file of files) { fs.mkdirSync(path.dirname(path.join(cwd,file)),{recursive:true});fs.writeFileSync(path.join(cwd,file),JSON.stringify(file.includes('previous')?{previousNavs:{}}:payload(day))); }
}
function identity(cwd:string) { git(cwd,'config','user.name','Test');git(cwd,'config','user.email','test@example.com'); }
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'psx-mufap-git-'));roots.push(root);
  const remote=path.join(root,'remote.git'), work=path.join(root,'work'), other=path.join(root,'other');
  git(root,'init','--bare','--initial-branch=main',remote);git(root,'clone',remote,work);identity(work);
  writeCatalog(work,'2026-10-21');git(work,'add','.');git(work,'commit','-m','Initial catalog');git(work,'push','origin','main');
  git(root,'clone',remote,other);identity(other);
  writeCatalog(work,'2026-10-22');
  return {root,remote,work,other};
}
afterEach(()=>{
  for(const root of roots.splice(0)) {
    if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('psx-mufap-git-'))throw new Error('Unsafe cleanup path');
    fs.rmSync(root,{recursive:true,force:true});
  }
});
it('retries a competing commit without losing it or force pushing',async()=>{
  const {work,other,remote}=fixture();
  const result=await publishCatalog({cwd:work,beforePush:async(attempt:number)=>{
    if(attempt!==1)return;
    fs.writeFileSync(path.join(other,'README.md'),'Another site update');git(other,'add','README.md');git(other,'commit','-m','Concurrent update');git(other,'push','origin','main');
  }});
  expect(result.status).toBe('published');
  expect(git(remote,'show','main:README.md')).toBe('Another site update');
  expect(JSON.parse(git(remote,'show',`main:${files[0]}`)).reportDate).toBe('2026-10-22');
  expect(git(remote,'show',`main:${files[0]}`)).toBe(git(remote,'show',`main:${files[2]}`));
  expect(git(work,'status','--porcelain')).toBe('');
},20000);
it('keeps a newer NAV catalog published during the push race',async()=>{
  const {work,other,remote}=fixture();
  const result=await publishCatalog({cwd:work,beforePush:async(attempt:number)=>{
    if(attempt!==1)return;
    writeCatalog(other,'2026-10-23');git(other,'add','.');git(other,'commit','-m','Newer NAVs');git(other,'push','origin','main');
  }});
  expect(result.status).toBe('superseded');
  expect(JSON.parse(git(remote,'show',`main:${files[0]}`)).reportDate).toBe('2026-10-23');
  expect(git(work,'status','--porcelain')).toBe('');
},20000);
it('does not discard unrelated local edits',async()=>{
  const {work}=fixture();
  git(work,'restore','--',...files);fs.writeFileSync(path.join(work,'source.js'),'original');git(work,'add','source.js');git(work,'commit','-m','Source');
  fs.writeFileSync(path.join(work,'source.js'),'local edit');writeCatalog(work,'2026-10-22');
  await expect(publishCatalog({cwd:work})).rejects.toThrow(/outside the generated NAV/);
  expect(fs.readFileSync(path.join(work,'source.js'),'utf8')).toBe('local edit');
});

it('repairs mismatched catalog copies using NAV dates rather than retrieval time',async()=>{
  const {work,remote}=fixture();
  fs.writeFileSync(path.join(work,files[0]),JSON.stringify({...payload('2026-10-20'),updatedAt:'2026-10-24T12:00:00Z'}));
  const result=await publishCatalog({cwd:work});
  expect(result.status).toBe('published');
  expect(JSON.parse(git(remote,'show',`main:${files[0]}`)).reportDate).toBe('2026-10-22');
  expect(git(remote,'show',`main:${files[0]}`)).toBe(git(remote,'show',`main:${files[2]}`));
},20000);
