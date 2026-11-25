import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const declared = readme.match(/^Version (\d+\.\d+\.\d+)\s*$/m);
const version = typeof pkg.version === "string" ? pkg.version : "";

if (declared?.[1] !== version) {
  console.error(`Version mismatch: package.json is ${version}, README is ${declared?.[1] ?? "missing"}.`);
  process.exit(1);
}

if (!readme.includes(`- ${version} —`)) {
  console.error(`README version history is missing ${version}.`);
  process.exit(1);
}

console.log(`Version ${version}`);
