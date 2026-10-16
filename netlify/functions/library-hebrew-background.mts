import { fillPendingResources } from "../lib/library-hebrew.mts";

// פונקציית רקע: משלימה "מה חדש" ו"התרומה" בעברית למחקרים שאושרו יחד ("אישור הנבחרים") לפני שהוכנו,
// ואז הם מופיעים ב"חידושים במחקר". רק מחקרים שאושרו, כדי לשלם רק על מה שנבחר.
export default async (req: Request) => {
  const secret = Netlify.env.get("EDITOR_SECRET") || "";
  if (!secret || req.headers.get("x-internal") !== secret) return;
  await fillPendingResources();
};
