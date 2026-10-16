import type { Config } from "@netlify/functions";
import { collect } from "../lib/library-feed.mts";
import { kickHebrew } from "../lib/library-hebrew.mts";
import { siteUrl } from "../lib/calls.mts";

// כל בוקר: מקורות חדשים בנושאי הקהילה נכנסים לתיבת האישור של הספרייה.
export default async () => {
  await collect();
  // מיד אחרי האיסוף: הכנת המדור, "מה חדש" ו"התרומה" בעברית לכל מחקר חדש.
  await kickHebrew(siteUrl(), true);
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "17 4 * * *" };
