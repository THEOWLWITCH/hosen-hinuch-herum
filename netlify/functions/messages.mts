import type { Config } from "@netlify/functions";
import { id, json, store, validToken } from "../lib/shared.mts";

type Attachment = { key:string; name:string; type?:string; size?:number };
type Message = {
  id:string; degree:string; name:string; institution:string; message:string;
  createdAt:string; expiresAt:string; attachments:Attachment[];
};

function dataStore(){ return store("hosen-data"); }
function fileStore(){ return store("hosen-files"); }

function pinOK(code: unknown) {
  const expected = process.env.BOARD_CODE || "";
  return !!expected && String(code || "") === expected;
}

async function listAll(): Promise<Message[]> {
  const st = dataStore();
  const { blobs } = await st.list({ prefix:"messages/" });
  const out: Message[] = [];
  for (const b of blobs) {
    const v = await st.get(b.key, { type:"json" });
    if (v) out.push(v as Message);
  }
  return out.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}

function decorate(x: Message) {
  return {
    ...x,
    attachments: (x.attachments || []).map(a => ({
      ...a,
      url: `/api/file?key=${encodeURIComponent(a.key)}`
    }))
  };
}

export default async (req: Request) => {
  const st = dataStore();

  if (req.method === "GET") {
    const u = new URL(req.url);
    const admin = u.searchParams.get("admin") === "1";
    if (admin && !(await validToken(req))) return json({ error:"unauthorized" }, 401);

    let rows = await listAll();
    if (!admin) {
      const now = Date.now();
      rows = rows.filter(x => Date.parse(x.expiresAt) > now);
    }
    return json(rows.map(decorate));
  }

  if (req.method === "POST") {
    const body = await req.json();
    if (!pinOK(body.code)) return json({ error:"invalid_code" }, 401);

    const now = new Date();
    const expires = new Date(body.expiresAt || "");
    const missing: string[] = [];

    if (!body.degree) missing.push("תואר אקדמי");
    if (!body.name) missing.push("שם מלא");
    if (!body.institution) missing.push("מוסד אקדמי");
    if (!body.message) missing.push("הודעה");

    if (missing.length) {
      return json({
        error:"missing_fields",
        message:`חסרים שדות חובה: ${missing.join(", ")}.`
      }, 400);
    }

    if (!Number.isFinite(expires.getTime()) || expires.getTime() <= now.getTime()) {
      return json({
        error:"missing_fields",
        message:"מועד סיום ההצגה חייב להיות בעתיד."
      }, 400);
    }

    const x: Message = {
      id:id(),
      degree:String(body.degree).slice(0,40),
      name:String(body.name).slice(0,120),
      institution:String(body.institution).slice(0,180),
      message:String(body.message).slice(0,5000),
      createdAt:now.toISOString(),
      expiresAt:expires.toISOString(),
      attachments:Array.isArray(body.attachments) ? body.attachments : []
    };

    await st.setJSON(`messages/${x.id}.json`, x);
    return json(decorate(x), 201);
  }

  if (req.method === "DELETE") {
    if (!(await validToken(req))) return json({ error:"unauthorized" }, 401);

    const body = await req.json();
    if (!body.id) return json({ error:"missing_id" }, 400);

    const key = `messages/${body.id}.json`;
    const old = await st.get(key, { type:"json" }) as Message | null;

    for (const a of old?.attachments || []) {
      if (a.key) await fileStore().delete(a.key);
    }

    await st.delete(key);
    return json({ ok:true });
  }

  return json({ error:"method" }, 405);
};

export const config: Config = {
  path:"/api/messages",
  rateLimit:{ windowLimit:30, windowSize:60, aggregateBy:["ip"] }
};
