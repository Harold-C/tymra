// Local files only. No .env, DB, provider, queue or scheduling imports.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { observationRosterSchema, planChristchurchObservations } from "@tymra/domain";

async function main() {
  const args = process.argv.slice(2), options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!["--roster", "--out"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(args[i]))
      throw new Error("Expected --roster FILE --out NEW_FILE");
    options.set(args[i], args[i + 1]);
  }
  if (!options.has("--roster") || !options.has("--out")) throw new Error("Expected --roster FILE --out NEW_FILE");
  const raw = await readFile(options.get("--roster")!, "utf8");
  const plan = { ...planChristchurchObservations(observationRosterSchema.parse(JSON.parse(raw))),
    inputSha256: createHash("sha256").update(raw).digest("hex") };
  await writeFile(options.get("--out")!, JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ status: plan.status, counts: plan.stageCounts, budget: plan.budget }) + "\n");
}
main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "Planning failed"}\n`); process.exitCode = 1; });
