import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const publicDir = resolve("public");
const outputDir = resolve("out");

if (existsSync(publicDir) && existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
  cpSync(publicDir, outputDir, { recursive: true, force: true });
}
