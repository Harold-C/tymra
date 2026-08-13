export type AdminColumn = { key: string; label: string };
export type AdminRow = { id: string; href?: string; cells: Record<string, React.ReactNode> };

import { SortableAdminTable } from "./SortableAdminTable";

export function AdminTable({ columns, rows, emptyTitle, emptyBody }: { columns: AdminColumn[]; rows: AdminRow[]; emptyTitle: string; emptyBody: string }) {
  if (!rows.length) return <div className="admin-empty"><h2>{emptyTitle}</h2><p>{emptyBody}</p></div>;
  return <SortableAdminTable columns={columns} rows={rows} />;
}

export function AdminListSummary({ locale, total, tools }: { locale: AdminLocale; total: number; tools?: React.ReactNode }) {
  const text = locale === "zh" ? `共 ${total.toLocaleString("zh-CN")} 条` : `${total.toLocaleString("en-NZ")} records`;
  return <div className="admin-list-summary"><strong>{text}</strong>{tools}</div>;
}

export function AdminPagination({ locale, page, pageSize, total, href }: { locale: AdminLocale; page: number; pageSize: number; total: number; href: (page: number, pageSize?: number) => string }) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, page * pageSize);
  const text = locale === "zh" ? { previous: "上一页", next: "下一页", page: `第 ${page} / ${totalPages} 页`, range: `${start}–${end} / ${total}`, perPage: "每页" } : { previous: "Previous", next: "Next", page: `Page ${page} of ${totalPages}`, range: `${start}–${end} of ${total}`, perPage: "Per page" };
  return <nav className="admin-pagination" aria-label={locale === "zh" ? "列表分页" : "List pagination"}>
    <span>{text.range}</span>
    <span className="admin-page-size"><span>{text.perPage}</span>{[25, 50, 100].map((size) => <a aria-current={pageSize === size ? "page" : undefined} href={href(1, size)} key={size}>{size}</a>)}</span>
    <a aria-disabled={page <= 1} href={href(page - 1)}>{text.previous}</a><strong>{text.page}</strong><a aria-disabled={page >= totalPages} href={href(page + 1)}>{text.next}</a>
  </nav>;
}

export function StatusPill({ value, locale = "en" }: { value: string; locale?: AdminLocale }) {
  const normalized = value.toLowerCase().replaceAll("_", "-");
  return <span className={`status-pill pill-${normalized}`}>{formatAdminValue(locale, value)}</span>;
}
import { formatAdminValue, type AdminLocale } from "@/lib/admin-i18n";
