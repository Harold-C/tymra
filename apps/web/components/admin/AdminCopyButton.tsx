"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import type { AdminLocale } from "@/lib/admin-i18n";

export function AdminCopyButton({ value, locale }: { value: string; locale: AdminLocale }) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
  return <button className="admin-copy-button" type="button" aria-label={copied ? (locale === "zh" ? "已复制" : "Copied") : (locale === "zh" ? "复制值" : "Copy value")} title={copied ? (locale === "zh" ? "已复制" : "Copied") : (locale === "zh" ? "复制" : "Copy")} onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>;
}
