import { mkdir, rm, copyFile, cp, access } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await copyFile("index.html", "dist/index.html");

for (const dir of ["assets", "public"]) {
  try {
    await access(dir);
    await cp(dir, `dist/${dir}`, { recursive: true });
  } catch {
    // Optional directory: ignore when absent.
  }
}

console.log("Static site copied to dist/");
