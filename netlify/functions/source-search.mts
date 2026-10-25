// חיפוש מקורות במאגרים בעולם (מצפן המחקר והחיפוש האקדמי בספרייה). המנוע: netlify/lib/source-search.mjs
// GET /api/source-search?q=...&from=2020&engines=openalex,eric
import type { Config } from "@netlify/functions";
import { searchSources, ENGINES } from "../lib/source-search.mjs";

const cache = new Map<string, { at: number; body: string }>(); // לאותו מופע, שעה

export default async (req: Request) => {
  const u = new URL(req.url);
  if (u.searchParams.get("engines") === "list") {
    return Response.json(Object.entries(ENGINES).map(([key, e]: [string, any]) => ({ key, name: e.name, info: e.info, active: !e.needsKey || !!Netlify.env.get(e.needsKey) })));
  }
  const q = (u.searchParams.get("q") || "").trim().slice(0, 300);
  if (q.length < 2) return Response.json({ error: "q", message: "כתבו נושא לחיפוש." }, { status: 400 });
  const from = Number(u.searchParams.get("from")) || 0;
  const engines = (u.searchParams.get("engines") || "").split(",").map(s => s.trim()).filter(Boolean);
  const key = JSON.stringify([q.toLowerCase(), from, engines]);
  const hit = cache.get(key);
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=900" };
  if (hit && Date.now() - hit.at < 3600_000) return new Response(hit.body, { headers });
  const r = await searchSources(q, { from, engines, env: (k: string) => Netlify.env.get(k) || "", ms: 6500 });
  const body = JSON.stringify(r);
  if (r.results.length) { cache.set(key, { at: Date.now(), body }); if (cache.size > 200) cache.delete(cache.keys().next().value!); }
  return new Response(body, { headers });
};

export const config: Config = { path: "/api/source-search" };
