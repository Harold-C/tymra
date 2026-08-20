export function parseAcceptanceProcessOutput<T extends object>(stdout: string, exitCode: number | null): T {
  const start = stdout.indexOf("{");
  if (start >= 0) {
    try {
      const end = jsonObjectEnd(stdout, start);
      const report = JSON.parse(stdout.slice(start, end)) as unknown;
      if (report && typeof report === "object" && !Array.isArray(report)) return report as T;
    } catch {
      // Fall through to the process-level error below.
    }
  }
  throw new Error(exitCode === 0
    ? "OTA acceptance output was not valid JSON"
    : `OTA acceptance exited ${exitCode ?? "unknown"} without a valid report`);
}

function jsonObjectEnd(value: string, start: number): number {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return index + 1;
  }
  return value.length;
}

export function resolveFrozenAcceptanceDates(
  environment: NodeJS.ProcessEnv,
  previous: Record<string, string> | undefined,
  sourceKeys: string[],
  today: string,
): Record<string, string> {
  const names = [
    "ACCEPTANCE_CHECK_IN",
    "ACCEPTANCE_CHECK_OUT",
    ...sourceKeys.flatMap((source) => [
      `ACCEPTANCE_${source.toUpperCase()}_CHECK_IN`,
      `ACCEPTANCE_${source.toUpperCase()}_CHECK_OUT`,
    ]),
  ];
  const explicit = Object.fromEntries(names.flatMap((name) => environment[name] ? [[name, environment[name]!]] : []));
  if (previous) {
    for (const [name, value] of Object.entries(explicit)) {
      if (previous[name] !== value) throw new Error(`${name} differs from the frozen OTA soak checkpoint`);
    }
    return { ...previous };
  }
  const checkIn = explicit.ACCEPTANCE_CHECK_IN ?? addIsoDays(today, 30);
  const checkOut = explicit.ACCEPTANCE_CHECK_OUT ?? addIsoDays(checkIn, 1);
  return { ACCEPTANCE_CHECK_IN: checkIn, ACCEPTANCE_CHECK_OUT: checkOut, ...explicit };
}

function addIsoDays(value: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new Error(`Invalid OTA soak calendar date: ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}
