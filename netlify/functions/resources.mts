import type { Config } from "@netlify/functions";
import { id, json, store, validToken } from "../lib/shared.mts";

type Resource = {
  id: string; title: string; description?: string; category: string; type: string;
  url?: string; fileKey?: string; fileName?: string; thumbnailKey?: string; thumbnailName?: string;
  startDate?: string; endDate?: string; active?: boolean; createdAt?: string; updatedAt?: string;
};

const dataStore = () => store("hosen-data");

async function listAll(): Promise<Resource[]> {
  const st = dataStore();
  const { blobs } = await st.list({ prefix: "resources/" });
  const out: Resource[] = [];
  for (const b of blobs) {
    const v = await st.get(b.key, { type: "json" });
    if (v) out.push(v as Resource);
  }
  return out.sort((a,b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function publicVisible(x: Resource) {
  const today = new Date().toISOString().slice(0,10);
  if (x.active === false) return false;
  if (x.startDate && x.startDate > today) return false;
  if (x.endDate && x.endDate < today) return false;
  return true;
}

function decorate(x: Resource) {
  return {
    ...x,
    fileUrl: x.fileKey ? `/api/file?key=${encodeURIComponent(x.fileKey)}` : "",
    thumbnailUrl: x.thumbnailKey ? `/api/file?key=${encodeURIComponent(x.thumbnailKey)}` : "",
  };
}

export default async (req: Request) => {
  const st = dataStore();
  if (req.method === "GET") {
    const u = new URL(req.url);
    const admin = u.searchParams.get("admin") === "1";
    if (admin && !(await validToken(req))) return json({ error: "unauthorized" }, 401);
    let rows = await listAll();
    if (!admin) rows = rows.filter(publicVisible);
    const cat = u.searchParams.get("category");
    if (cat) rows = rows.filter(x => x.category === cat);
    return json(rows.map(decorate));
  }
  if (!(await validToken(req))) return json({ error: "unauthorized" }, 401);
  if (req.method === "POST") {
    const body = await req.json();
    const now = new Date().toISOString();
    const x: Resource = { ...body, id: id(), active: body.active !== false, createdAt: now, updatedAt: now };
    if (!x.title || !x.category) return json({ error: "missing_fields" }, 400);
    await st.setJSON(`resources/${x.id}.json`, x);
    return json(decorate(x), 201);
  }
  if (req.method === "PUT") {
    const body = await req.json();
    if (!body.id) return json({ error: "missing_id" }, 400);
    const key = `resources/${body.id}.json`;
    const old = await st.get(key, { type: "json" });
    if (!old) return json({ error: "not_found" }, 404);
    const x = { ...old, ...body, id: body.id, updatedAt: new Date().toISOString() };
    await st.setJSON(key, x);
    return json(decorate(x));
  }
  if (req.method === "DELETE") {
    const body = await req.json();
    if (!body.id) return json({ error: "missing_id" }, 400);
    const key = `resources/${body.id}.json`;
    const old = await st.get(key, { type: "json" });
    if (old?.fileKey) await store("hosen-files").delete(old.fileKey);
    if (old?.thumbnailKey) await store("hosen-files").delete(old.thumbnailKey);
    await st.delete(key);
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
};

export const config: Config = { path: "/api/resources" };
