import type { ValidationCode } from "../../lib/home-validation";

export type SearchState =
  | { status: "idle"; value: string }
  | { status: "typing"; value: string }
  | { status: "submitting"; value: string }
  | { status: "challenge"; value: string; challenge: { mode: "deterministic" | "managed"; token?: string; siteKey?: string } }
  | { status: "validationError"; value: string; error: { code: ValidationCode; message: string } };

export type DeviceType = "desktop" | "mobile";
