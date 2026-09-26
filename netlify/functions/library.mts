import type { Config } from "@netlify/functions";
import { id, json, store, validToken } from "../lib/shared.mts";

type Source = { id:string; apa?:string; authors?:string; year?:string; title?:string; journal?:string; doi?:string; abstract?:string; type?:string; fileKey?:string; fileName?:string; createdAt?:string; updatedAt?:string };
const st = () => store("hosen-data");

async function listAll(): Promise<Source[]> {
  const s=st(); const { blobs }=await s.list({ prefix:"library/" }); const out:Source[]=[];
  for (const b of blobs) { const v=await s.get(b.key,{type:"json"}); if(v) out.push(v as Source); }
  return out.sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")));
}
function decorate(x:Source){ return {...x,fileUrl:x.fileKey?`/api/file?key=${encodeURIComponent(x.fileKey)}`:""}; }

export default async (req:Request) => {
  const s=st();
  if(req.method==="GET") return json((await listAll()).map(decorate));
  if(!(await validToken(req))) return json({error:"unauthorized"},401);
  if(req.method==="POST"){
    const body=await req.json(); const now=new Date().toISOString();
    if(Array.isArray(body.bulk)){
      const created=[];
      for(const apa of body.bulk.map((x:any)=>String(x).trim()).filter(Boolean)){
        const x:Source={id:id(),apa,title:apa,type:"מאמר",createdAt:now,updatedAt:now};
        await s.setJSON(`library/${x.id}.json`,x); created.push(x);
      }
      return json(created.map(decorate),201);
    }
    const x:Source={...body,id:id(),createdAt:now,updatedAt:now};
    if(!x.title&&!x.apa) return json({error:"missing_fields"},400);
    await s.setJSON(`library/${x.id}.json`,x); return json(decorate(x),201);
  }
  if(req.method==="PUT"){
    const body=await req.json(); if(!body.id) return json({error:"missing_id"},400);
    const key=`library/${body.id}.json`; const old=await s.get(key,{type:"json"}); if(!old) return json({error:"not_found"},404);
    const x={...old,...body,id:body.id,updatedAt:new Date().toISOString()}; await s.setJSON(key,x); return json(decorate(x));
  }
  if(req.method==="DELETE"){
    const body=await req.json(); if(!body.id) return json({error:"missing_id"},400);
    const key=`library/${body.id}.json`; const old=await s.get(key,{type:"json"});
    if(old?.fileKey) await store("hosen-files").delete(old.fileKey);
    await s.delete(key); return json({ok:true});
  }
  return json({error:"method"},405);
};
export const config:Config={path:"/api/library"};
