import { mkdir, rm, copyFile, cp, access, readFile } from "node:fs/promises";
import { check } from "./research-weekly.mjs";

// חידושים במחקר: עדכון שבור לא עולה לאתר (Netlify משאיר את הגרסה הקודמת).
const research = check(await readFile("index.html", "utf8"));
if (research.errors.length) {
  console.error("חידושים במחקר:\n" + research.errors.join("\n"));
  process.exit(1);
}

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await copyFile("index.html", "dist/index.html");
await copyFile("guide.html", "dist/guide.html"); // המדריך לקהילה: /guide

try {
  await access("_redirects");
  await copyFile("_redirects", "dist/_redirects");
} catch {
  // Optional Netlify clean-route rewrites.
}

for (const dir of ["assets", "public"]) {
  try {
    await access(dir);
    await cp(dir, `dist/${dir}`, { recursive: true });
  } catch {
    // Optional directory: ignore when absent.
  }
}

console.log("Static site copied to dist/");
