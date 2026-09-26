import { getStore } from "@netlify/blobs";

export function store(name: string) {
  return getStore({ name, consistency: "strong" });
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function secret() {
  return Netlify.env.get("EDITOR_SECRET") || "";
}

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

export async function issueToken() {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload = String(exp);
  return `${payload}.${await hmac(payload)}`;
}

export async function validToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ")) return false;
  const [payload, sig] = h.slice(7).split(".");
  if (!payload || !sig || Number(payload) < Date.now()) return false;
  return sig === (await hmac(payload));
}

export function id() {
  return crypto.randomUUID();
}

export function safeName(name: string) {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 120) || "file";
}
