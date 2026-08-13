import { decryptPersonalData } from "@tymra/db";

export type PersonalDataResult = { value: string; readable: true } | { value: null; readable: false };

export function safelyDecryptPersonalData(encrypted: string, key: string, decrypt: (value: string, key: string) => string = decryptPersonalData): PersonalDataResult {
  try { return { value: decrypt(encrypted, key), readable: true }; }
  catch { return { value: null, readable: false }; }
}
