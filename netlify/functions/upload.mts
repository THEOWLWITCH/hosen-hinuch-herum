import type { Config } from "@netlify/functions";
import { id, json, safeName, store, validToken } from "../lib/shared.mts";

export default async (req:Request) => {
  if(req.method!=="POST") return json({error:"method"},405);
  if(!(await validToken(req))) return json({error:"unauthorized"},401);
  const form=await req.formData(); const f=form.get("file");
  if(!(f instanceof File)) return json({error:"missing_file"},400);
  if(f.size > 4_000_000) return json({error:"file_too_large",message:"בשל מגבלת Netlify, העלאה ישירה מוגבלת לכ־4MB. לקובץ גדול יש להשתמש בקישור."},413);
  const key=`files/${id()}-${safeName(f.name)}`;
  await store("hosen-files").set(key,f,{metadata:{contentType:f.type||"application/octet-stream",filename:f.name}});
  return json({key,name:f.name,url:`/api/file?key=${encodeURIComponent(key)}`},201);
};
export const config:Config={path:"/api/upload"};
