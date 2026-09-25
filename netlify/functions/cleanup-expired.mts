import type { Config } from "@netlify/functions";
import { store } from "../lib/shared.mts";
type Attachment={key:string}; type Message={expiresAt:string;attachments?:Attachment[]};
export default async()=>{
 const data=store("hosen-data");const files=store("hosen-files");const {blobs}=await data.list({prefix:"messages/"});const now=Date.now();
 for(const b of blobs){const x=await data.get(b.key,{type:"json"}) as Message|null;if(x&&Date.parse(x.expiresAt)<=now){for(const a of x.attachments||[]){if(a.key)await files.delete(a.key);}await data.delete(b.key);}}
 return new Response(null,{status:204});
};
export const config:Config={schedule:"@hourly"};
