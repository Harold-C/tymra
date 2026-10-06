import { nzDateKey } from "@tymra/domain";
import { AdapterError } from "../adapter-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function addUtcDays(value: Date, days: number) { return new Date(value.getTime() + days * 86_400_000); }

export function isoDate(value: Date) { return nzDateKey(value); }

export function cleanText(value: string) { return value.replace(/\s+/g, " ").trim(); }

export function slug(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new AdapterError("PARSING_ERROR", `Source response exceeds ${maxBytes} bytes`, false);
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AdapterError("PARSING_ERROR", `Source response exceeds ${maxBytes} bytes`, false);
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
}
