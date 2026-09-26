import type { Config } from "@netlify/functions";
import { store } from "../lib/shared.mts";

export default async (req:Request) => {
  if(req.method!=="GET") return new Response("Method not allowed",{status:405});
  const key=new URL(req.url).searchParams.get("key")||"";
  if(!key.startsWith("files/")) return new Response("Bad key",{status:400});
  const found=await store("hosen-files").getWithMetadata(key,{type:"blob"});
  if(!found) return new Response("Not found",{status:404});
  const headers=new Headers();
  headers.set("content-type",String(found.metadata?.contentType||"application/octet-stream"));
  const filename=String(found.metadata?.filename||"file").replace(/["\r\n]/g,"");
  headers.set("content-disposition",`inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
  headers.set("cache-control","public, max-age=3600");
  return new Response(found.data,{headers});
};
export const config:Config={path:"/api/file"};
