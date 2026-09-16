import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

if (process.platform === "linux" && process.arch === "x64") {
  const require = createRequire(import.meta.url);
  const source = require.resolve("@garden-co/jazz-napi-linux-x64-gnu");
  const target = join(dirname(require.resolve("jazz-napi")), "jazz-napi.linux-x64-gnu.node");

  if (source !== target) copyFileSync(source, target);
  console.log("Prepared Jazz NAPI Linux binding for the Next.js server build.");
}
