import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type AcceptanceArtifactInput = {
  acceptanceId: string;
  startedAt: Date | string;
  finishedAt: Date | string;
  durationMs: number;
  sourceCount: number;
  passCount: number;
  enabledSchedulesBefore: number;
  enabledSchedulesAfter: number;
  activeAcceptanceExecutions: number;
  passed: boolean;
  failures: Array<{ sourceKey: string; failures: string[] }>;
};

export async function writeAcceptanceArtifacts(report: AcceptanceArtifactInput, outputDirectory = process.env.ACCEPTANCE_OUTPUT_DIR ?? "output/acceptance") {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  const stem = report.acceptanceId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const jsonPath = resolve(directory, `${stem}.json`);
  const markdownPath = resolve(directory, `${stem}.md`);
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, acceptanceMarkdown(report), "utf8"),
  ]);
  return { jsonPath, markdownPath };
}

export function acceptanceMarkdown(report: AcceptanceArtifactInput) {
  const result = report.passed ? "PASSED" : "FAILED";
  const failures = report.failures.length
    ? report.failures.flatMap((item) => item.failures.map((failure) => `- ${item.sourceKey}: ${failure}`)).join("\n")
    : "- None";
  return `# Public-source acceptance — ${result}\n\n- Acceptance ID: \`${report.acceptanceId}\`\n- Window: ${new Date(report.startedAt).toISOString()} → ${new Date(report.finishedAt).toISOString()}\n- Sources / passes: ${report.sourceCount} / ${report.passCount}\n- Duration: ${report.durationMs} ms\n- Enabled schedules: ${report.enabledSchedulesBefore} → ${report.enabledSchedulesAfter}\n- Active Argus executions after completion: ${report.activeAcceptanceExecutions}\n\n## Failures\n\n${failures}\n`;
}
