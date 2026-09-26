import type { Config } from "@netlify/functions";
import { id, json, store, validToken } from "../lib/shared.mts";

type Media = { key:string; name:string; type?:string; title:string; credit:string; date:string };
type GalleryItem = {
  id:string; title:string; date:string; description?:string; media:Media[];
  active?:boolean; createdAt?:string; updatedAt?:string;
};

function dataStore(){ return store("hosen-data"); }
function fileStore(){ return store("hosen-files"); }
async function listAll():Promise<GalleryItem[]> {
  const st=dataStore(); const {blobs}=await st.list({prefix:"gallery/"}); const out:GalleryItem[]=[];
  for(const b of blobs){ const v=await st.get(b.key,{type:"json"}); if(v) out.push(v as GalleryItem); }
  return out.sort((a,b)=>String(b.date||b.createdAt||"").localeCompare(String(a.date||a.createdAt||"")));
}
function decorate(x:GalleryItem){
  return {...x, media:(x.media||[]).map(m=>({...m,url:`/api/file?key=${encodeURIComponent(m.key)}`}))};
}
function validMediaMetadata(media:Media[]){ return Array.isArray(media)&&media.length>0&&media.every(m=>!!m?.key&&!!String(m.title||'').trim()&&!!String(m.credit||'').trim()&&!!String(m.date||'').trim()); }

export default async (req:Request) => {
  const st=dataStore();
  if(req.method==="GET"){
    const u=new URL(req.url); const admin=u.searchParams.get("admin")==="1";
    if(admin && !(await validToken(req))) return json({error:"unauthorized"},401);
    let rows=await listAll(); if(!admin) rows=rows.filter(x=>x.active!==false);
    return json(rows.map(decorate));
  }
  if(!(await validToken(req))) return json({error:"unauthorized"},401);
  if(req.method==="POST"){
    const body=await req.json(); const now=new Date().toISOString();
    const x:GalleryItem={...body,id:id(),active:body.active!==false,createdAt:now,updatedAt:now,media:Array.isArray(body.media)?body.media:[]};
    if(!x.title||!x.date||!x.media.length) return json({error:"missing_fields",message:"חסרים כותרת, תאריך או תמונות."},400);
    if(!validMediaMetadata(x.media)) return json({error:"media_metadata",message:"לכל תמונה חובה להזין כותרת, קרדיט ותאריך צילום."},400);
    await st.setJSON(`gallery/${x.id}.json`,x); return json(decorate(x),201);
  }
  if(req.method==="PUT"){
    const body=await req.json(); if(!body.id) return json({error:"missing_id"},400);
    const key=`gallery/${body.id}.json`; const old=await st.get(key,{type:"json"}) as GalleryItem|null;
    if(!old) return json({error:"not_found"},404);
    const nextMedia=Array.isArray(body.media)?body.media:old.media||[];
    const keep=new Set(nextMedia.map((m:Media)=>m.key));
    for(const m of old.media||[]){ if(m.key&&!keep.has(m.key)) await fileStore().delete(m.key); }
    const x:GalleryItem={...old,...body,id:body.id,media:nextMedia,updatedAt:new Date().toISOString()};
    if(!x.title||!x.date||!x.media.length) return json({error:"missing_fields",message:"חסרים כותרת, תאריך או תמונות."},400);
    if(!validMediaMetadata(x.media)) return json({error:"media_metadata",message:"לכל תמונה חובה להזין כותרת, קרדיט ותאריך צילום."},400);
    await st.setJSON(key,x); return json(decorate(x));
  }
  if(req.method==="DELETE"){
    const body=await req.json(); if(!body.id) return json({error:"missing_id"},400);
    const key=`gallery/${body.id}.json`; const old=await st.get(key,{type:"json"}) as GalleryItem|null;
    for(const m of old?.media||[]){ if(m.key) await fileStore().delete(m.key); }
    await st.delete(key); return json({ok:true});
  }
  return json({error:"method"},405);
};
export const config:Config={path:"/api/gallery"};
