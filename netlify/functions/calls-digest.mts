import type { Config } from "@netlify/functions";
import { mailConfigured, sendWeeklyDigests, siteUrl } from "../lib/calls.mts";

// כל יום ראשון בבוקר: סיכום שבועי אישי לכל חוקרת. פועל רק כשחיבור Gmail מוגדר.
export default async () => {
  if (mailConfigured()) await sendWeeklyDigests(siteUrl());
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "52 4 * * 0" };
