import type { Config } from "@netlify/functions";
import { mailConfigured, sendManagerDigest, siteUrl } from "../lib/calls.mts";

// כל בוקר, אחרי האיסוף: סיכום למנהלת הקולות הקוראים — רק כשיש חדשים שמחכים לאישור.
export default async () => {
  if (mailConfigured()) await sendManagerDigest(siteUrl());
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "37 5 * * *" };
