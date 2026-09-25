import type { Config } from "@netlify/functions";
import { id, json, safeName, store } from "../lib/shared.mts";
function pinOK(code:unknown){const expected=Netlify.env.get("BOARD_CODE")||"";return !!expected&&String(code||"")===expected;}
function allowed(name:string,type:string){
 const ext=(name.split(".").pop()||"").toLowerCase();
 const okExt=new Set(["pdf","doc","docx","ppt","pptx","xls","xlsx","csv","odt","ods","odp","txt","rtf","jpg","jpeg","png","webp","gif","mp4","mov"]);
 return okExt.has(ext)||type.startsWith("image/")||type.startsWith("video/")||type==="application/pdf";
}
export default async(req:Request)=>{
 if(req.method!=="POST")return json({error:"method"},405);
 const form=await req.formData(); if(!pinOK(form.get("code")))return json({error:"invalid_code"},401);
 const f=form.get("file");if(!(f instanceof File))return json({error:"missing_file"},400);
 if(!allowed(f.name,f.type))return json({error:"file_type",message:`סוג הקובץ ${f.name} אינו נתמך.`},415);
 if(f.size>4_000_000)return json({error:"file_too_large",message:"העלאה ישירה מוגבלת לכ־4MB לקובץ. עבור וידאו או קובץ גדול יש לצרף קישור בתוך ההודעה."},413);
 const key=`files/${id()}-${safeName(f.name)}`;
 await store("hosen-files").set(key,f,{metadata:{contentType:f.type||"application/octet-stream",filename:f.name}});
 return json({key,name:f.name,type:f.type,size:f.size,url:`/api/file?key=${encodeURIComponent(key)}`},201);
};
export const config:Config={path:"/api/board-upload",rateLimit:{windowLimit:30,windowSize:60,aggregateBy:["ip"]}};
