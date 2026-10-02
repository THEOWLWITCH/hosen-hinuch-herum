import type { Config } from "@netlify/functions";
import { id, json, store, validToken } from "../lib/shared.mts";

type Discussion = {
  id: string;
  week: string;
  studyId: string;
  degree: string;
  name: string;
  institution: string;
  email: string;
  comment: string;
  createdAt: string;
};

const discussionStore = () => store("hosen-data");

function codeOK(code: unknown) {
  const expected = Netlify.env.get("BOARD_CODE") || "";
  return !!expected && String(code || "") === expected;
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function publicRow(x: Discussion) {
  const { email, ...row } = x;
  return row;
}

async function list(week: string, studyId: string) {
  const { blobs } = await discussionStore().list({ prefix: "research-discussions/" });
  const rows: Discussion[] = [];
  for (const blob of blobs) {
    const value = await discussionStore().get(blob.key, { type: "json" }) as Discussion | null;
    if (value && value.week === week && value.studyId === studyId) rows.push(value);
  }
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default async (req: Request) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const week = clean(url.searchParams.get("week"), 20);
    const studyId = clean(url.searchParams.get("studyId"), 160);
    if (!week || !studyId) return json({ error: "missing_query" }, 400);
    return json((await list(week, studyId)).map(publicRow));
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const tokenOK = await validToken(req, "admin");
    if (!tokenOK && !codeOK(body.communityCode)) {
      return json({ error: "invalid_code", message: "קוד הקהילה שגוי." }, 401);
    }

    const week = clean(body.week, 20);
    const studyId = clean(body.studyId, 160);
    const degree = clean(body.degree, 80);
    const name = clean(body.name, 180);
    const institution = clean(body.institution, 240);
    const email = clean(body.email, 320);
    const comment = clean(body.comment, 4000);
    if (!week || !studyId || !degree || !name || !institution || !email || !comment) {
      return json({ error: "missing_fields", message: "יש למלא תואר, שם, מוסד, מייל ותגובה." }, 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return json({ error: "invalid_email", message: "יש להזין כתובת מייל תקינה." }, 400);
    }

    const row: Discussion = {
      id: id(), week, studyId, degree, name, institution, email, comment,
      createdAt: new Date().toISOString()
    };
    await discussionStore().setJSON(`research-discussions/${row.id}.json`, row);
    return json(publicRow(row), 201);
  }

  if (req.method === "DELETE") {
    if (!(await validToken(req, "admin"))) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const rowId = clean(body.id, 120);
    if (!rowId) return json({ error: "missing_id" }, 400);
    await discussionStore().delete(`research-discussions/${rowId}.json`);
    return json({ ok: true });
  }

  return json({ error: "method" }, 405);
};

export const config: Config = {
  path: "/api/research-discussions",
  rateLimit: { windowLimit: 12, windowSize: 60, aggregateBy: ["ip"] }
};
