import type { Config } from "@netlify/functions";
import { collect } from "../lib/library-feed.mts";

// כל בוקר: מקורות חדשים בנושאי הקהילה נכנסים לתיבת האישור של הספרייה.
export default async () => {
  await collect();
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "17 4 * * *" };
