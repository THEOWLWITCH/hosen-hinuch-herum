import type { Config } from "@netlify/functions";
import { publishInbox } from "../lib/calls.mts";

// כל יום ראשון, חצי שעה לפני הסיכום השבועי: כל הקולות הקוראים שנאספו במהלך השבוע עולים לאתר, בלי מיון ידני.
// הסיכום השבועי (calls-digest) שולח אותם אחר כך לחוקרים ולחוקרות.
export default async () => {
  await publishInbox();
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "22 4 * * 0" };
