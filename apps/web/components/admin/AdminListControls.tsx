"use client";

import { Bookmark, Check, Download } from "lucide-react";
import { useEffect, useState } from "react";

import type { AdminLocale } from "@/lib/admin-i18n";

const savedViewsKey = "tymra.admin.saved-views.v1";

export function AdminListTools({ locale, viewName }: { locale: AdminLocale; viewName: string }) {
  const [saved, setSaved] = useState(false);
  const text = locale === "zh"
    ? { save: "保存当前视图", saved: "已保存视图", export: "导出当前页" }
    : { save: "Save current view", saved: "View saved", export: "Export current page" };

  useEffect(() => {
    const entries = readSavedViews();
    setSaved(entries.some((entry) => entry.url === currentRelativeUrl()));
  }, []);

  function toggleSaved() {
    const url = currentRelativeUrl();
    const entries = readSavedViews();
    const exists = entries.some((entry) => entry.url === url);
    const next = exists ? entries.filter((entry) => entry.url !== url) : [...entries.filter((entry) => entry.name !== viewName), { name: viewName, url }].slice(-12);
    window.localStorage.setItem(savedViewsKey, JSON.stringify(next));
    setSaved(!exists);
    window.dispatchEvent(new Event("tymra:saved-views"));
  }

  function exportCurrentPage() {
    const table = document.querySelector<HTMLTableElement>("table[data-admin-table]");
    if (!table) return;
    const rows = [...table.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("th,td")].map((cell) => csvCell(cell.textContent?.trim() ?? "")).join(","));
    const blob = new Blob([`\uFEFF${rows.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${slug(viewName)}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <div className="admin-list-tools">
    <button className="button button-secondary" type="button" aria-pressed={saved} onClick={toggleSaved}>{saved ? <Check size={15} /> : <Bookmark size={15} />}{saved ? text.saved : text.save}</button>
    <button className="button button-secondary" type="button" onClick={exportCurrentPage}><Download size={15} />{text.export}</button>
  </div>;
}

type SavedView = { name: string; url: string };
function readSavedViews(): SavedView[] {
  try { const value = JSON.parse(window.localStorage.getItem(savedViewsKey) ?? "[]"); return Array.isArray(value) ? value.filter((entry): entry is SavedView => typeof entry?.name === "string" && typeof entry?.url === "string") : []; }
  catch { return []; }
}
function currentRelativeUrl() { return `${window.location.pathname}${window.location.search}`; }
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "tymra-admin"; }
