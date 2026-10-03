import type { Config } from "@netlify/functions";
import { collectFromSources } from "../lib/calls.mts";

// כל בוקר: איסוף קולות קוראים מהמקורות לתיבת האישור של מנהלת המערכת.
export default async () => {
  await collectFromSources();
  return new Response(null, { status: 204 });
};

export const config: Config = { schedule: "47 3 * * *" };
