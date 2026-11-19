import type { Config } from "@netlify/functions";
import { id, json, store, validToken, cleanLinks } from "../lib/shared.mts";

type Media = { key:string; name:string; type?:string; title?:string; credit?:string; date?:string };
type GalleryItem = {
  id:string; title:string; date:string; description?:string; media:Media[];
  uploadMode?:"single"|"album"; active?:boolean; createdAt?:string; updatedAt?:string;
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
function validMedia(media:Media[]){ return Array.isArray(media)&&media.length>0&&media.every(m=>!!m?.key); }

// Albums added from the repo (images in /assets/gallery/...). Each is copied once into the
// stores and then behaves like any album: editable and deletable from admin. A marker keeps
// a deleted album from coming back.
type SeedAlbum = { id:string; title:string; date:string; description:string; dir:string; media:{file:string; title:string}[] };
const SEED_ALBUMS:SeedAlbum[]=[{
  id:"meeting-2026-11-18",
  title:"המפגש השני של הקהילה",
  date:"2026-11-18",
  description:"מפגש הזום השני של הקהילה, 18.11.2026: הצגת היוזמה \"מילואים בחינוך\" ומודל הרציפות הקהילתית בחירום, ומחקר על שמירה על רציפות חינוכית במלחמה, כהצעה למושב סימפוזיון בכנס ICER 2027.",
  dir:"/assets/gallery/2026-11-18/",
  media:[
    {file:"01.webp",title:"משתתפות ומשתתפי המפגש"},
    {file:"02.webp",title:"הצגת הרעיון: מערך מילואים בחינוך"},
    {file:"03.webp",title:"מערך המילואים: עקרונות מנחים ותפקיד בשגרה ובחירום"},
    {file:"04.webp",title:"מילואים בחינוך: מודל הרציפות הקהילתית בחירום"},
    {file:"05.webp",title:"נקודות מבט של מחזיקי עניין: win לכולם"},
    {file:"06.webp",title:"שמירה על רציפות חינוכית במלחמה: בעיה סוררת"},
    {file:"07.webp",title:"פער מחקרי ושאלת המחקר"},
    {file:"08.webp",title:"מסגרת תאורטית: שתי פרקטיקות משלימות"},
    {file:"09.webp",title:"הצעה למושב סימפוזיון בכנס ICER 2027: מנהיגות אינטגרטיבית לשמירה על רציפות חינוכית בחירום"}
  ]
}];
async function ensureSeeds(req:Request){
  const st=dataStore();
  for(const a of SEED_ALBUMS){
    const marker=`gallery-seeded/${a.id}`;
    try{
      if(await st.get(marker)) continue;
      const origin=new URL(req.url).origin; const media:Media[]=[];
      for(const m of a.media){
        const r=await fetch(origin+a.dir+m.file); if(!r.ok) throw new Error("asset "+m.file);
        const key=`files/gallery-${a.id}-${m.file}`;
        await fileStore().set(key,await r.arrayBuffer(),{metadata:{contentType:"image/webp",filename:m.file}});
        media.push({key,name:m.file,type:"image/webp",title:m.title,date:a.date});
      }
      const now=new Date().toISOString();
      const x:GalleryItem={id:a.id,title:a.title,date:a.date,description:a.description,media,uploadMode:"album",active:true,createdAt:now,updatedAt:now};
      await st.setJSON(`gallery/${a.id}.json`,x);
      await st.set(marker,now);
    }catch(e){ console.error("gallery seed failed",a.id,e); }
  }
}

export default async (req:Request) => {
  const st=dataStore();
  if(req.method==="GET"){
    await ensureSeeds(req);
    const u=new URL(req.url); const admin=u.searchParams.get("admin")==="1";
    if(admin && !(await validToken(req,"admin"))) return json({error:"unauthorized"},401);
    let rows=await listAll(); if(!admin) rows=rows.filter(x=>x.active!==false);
    return json(rows.map(decorate));
  }
  if(req.method==="POST"){
    if(!(await validToken(req,["admin","uploader"]))) return json({error:"unauthorized"},401);
    const body=await req.json(); const now=new Date().toISOString();
    const x:GalleryItem={...body,links:cleanLinks(body.links),id:id(),active:body.active!==false,createdAt:now,updatedAt:now,media:Array.isArray(body.media)?body.media:[]};
    if(!x.title||!x.date||!x.media.length) return json({error:"missing_fields",message:"חסרים כותרת, תאריך או תמונות."},400);
    if(!validMedia(x.media)) return json({error:"media",message:"נבחרה תמונה לא תקינה."},400);
    await st.setJSON(`gallery/${x.id}.json`,x); return json(decorate(x),201);
  }
  if(req.method==="PUT"){
    if(!(await validToken(req,"admin"))) return json({error:"unauthorized"},401);
    const body=await req.json(); if(!body.id) return json({error:"missing_id"},400);
    const key=`gallery/${body.id}.json`; const old=await st.get(key,{type:"json"}) as GalleryItem|null;
    if(!old) return json({error:"not_found"},404);
    const nextMedia=Array.isArray(body.media)?body.media:old.media||[];
    const keep=new Set(nextMedia.map((m:Media)=>m.key));
    for(const m of old.media||[]){ if(m.key&&!keep.has(m.key)) await fileStore().delete(m.key); }
    const x:GalleryItem={...old,...body,links:body.links===undefined?((old as any).links||[]):cleanLinks(body.links),id:body.id,media:nextMedia,updatedAt:new Date().toISOString()};
    if(!x.title||!x.date||!x.media.length) return json({error:"missing_fields",message:"חסרים כותרת, תאריך או תמונות."},400);
    if(!validMedia(x.media)) return json({error:"media",message:"נבחרה תמונה לא תקינה."},400);
    await st.setJSON(key,x); return json(decorate(x));
  }
  if(req.method==="DELETE"){
    if(!(await validToken(req,"admin"))) return json({error:"unauthorized"},401);
    const body=await req.json(); if(!body.id) return json({error:"missing_id"},400);
    const key=`gallery/${body.id}.json`; const old=await st.get(key,{type:"json"}) as GalleryItem|null;
    for(const m of old?.media||[]){ if(m.key) await fileStore().delete(m.key); }
    await st.delete(key); return json({ok:true});
  }
  return json({error:"method"},405);
};
export const config:Config={path:"/api/gallery"};
