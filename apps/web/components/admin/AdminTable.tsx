export type AdminColumn = { key: string; label: string };
export type AdminRow = { id: string; href?: string; cells: Record<string, React.ReactNode> };

export function AdminTable({ columns, rows, emptyTitle, emptyBody }: { columns: AdminColumn[]; rows: AdminRow[]; emptyTitle: string; emptyBody: string }) {
  if (!rows.length) return <div className="admin-empty"><h2>{emptyTitle}</h2><p>{emptyBody}</p></div>;
  return <div className="admin-table-wrap" tabIndex={0}><table className="admin-table"><thead><tr>{columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} data-href={row.href}>{columns.map((column, index) => <td key={column.key}>{index === 0 && row.href ? <a href={row.href}>{row.cells[column.key]}</a> : row.cells[column.key]}</td>)}</tr>)}</tbody></table></div>;
}

export function StatusPill({ value, locale = "en" }: { value: string; locale?: AdminLocale }) {
  const normalized = value.toLowerCase().replaceAll("_", "-");
  return <span className={`status-pill pill-${normalized}`}>{formatAdminValue(locale, value)}</span>;
}
import { formatAdminValue, type AdminLocale } from "@/lib/admin-i18n";
