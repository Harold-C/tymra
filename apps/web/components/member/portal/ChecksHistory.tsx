"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { type CheckListItem } from "../contracts";
import { Page, Loading, ErrorState } from "./shared";
import type { Locale } from "../contracts";
import { api } from "./api";

export function ChecksHistory({ locale }: { locale: Locale }) {
  const [checks, setChecks] = useState<CheckListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api<CheckListItem[]>("/api/v1/customer/checks").then(setChecks).catch((caught) => setError(String(caught.message ?? caught))); }, []);
  const filtered = useMemo(() => (checks ?? []).filter((check) => (status === "ALL" || check.status === status) && `${check.property?.canonicalName ?? ""} ${check.unit?.officialName ?? ""}`.toLowerCase().includes(query.toLowerCase())), [checks, query, status]);
  const pageSize = 10;
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize);
  const title = locale === "zh" ? "价格检查历史" : "Price Check history";
  return <Page locale={locale} eyebrow={locale === "zh" ? "报告" : "REPORTS"} title={title} body={locale === "zh" ? "查找、筛选并重新打开属于你的历史报告。" : "Find, filter and reopen reports that belong to your account."}>
    <div className="member-toolbar"><label><span>{locale === "zh" ? "搜索" : "Search"}</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label><label><span>{locale === "zh" ? "状态" : "Status"}</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">{locale === "zh" ? "全部" : "All"}</option>{[...new Set((checks ?? []).map((item) => item.status))].map((value) => <option key={value}>{value}</option>)}</select></label><Link className="button button-primary" href={`/${locale}/address-check`}>{locale === "zh" ? "新建检查" : "New Price Check"}</Link></div>
    {error ? <ErrorState message={error} /> : !checks ? <Loading locale={locale} /> : shown.length ? <><div className="account-check-list">{shown.map((check) => <Link href={`/${locale}/account/checks/${check.id}`} key={check.id}><span>{check.property?.canonicalName ?? title}</span><strong>{check.status}</strong><small>{check.unit?.officialName} · {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeZone: "Pacific/Auckland" }).format(new Date(check.createdAt))}</small></Link>)}</div><div className="member-pagination"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>{locale === "zh" ? "上一页" : "Previous"}</button><span>{page} / {Math.max(1, Math.ceil(filtered.length / pageSize))}</span><button disabled={page * pageSize >= filtered.length} onClick={() => setPage((value) => value + 1)}>{locale === "zh" ? "下一页" : "Next"}</button></div></> : <div className="account-empty"><h2>{locale === "zh" ? "没有匹配的检查" : "No matching checks"}</h2></div>}
  </Page>;
}
