"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { isValidElement, type ReactNode, useMemo, useState } from "react";

import type { AdminColumn, AdminRow } from "./AdminTable";

export function SortableAdminTable({ columns, rows }: { columns: AdminColumn[]; rows: AdminRow[] }) {
  const [sort, setSort] = useState<{ key: string; direction: "ascending" | "descending" } | null>(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => compare(nodeText(a.cells[sort.key]), nodeText(b.cells[sort.key])) * (sort.direction === "ascending" ? 1 : -1));
  }, [rows, sort]);
  function toggle(key: string) { setSort((current) => current?.key !== key ? { key, direction: "ascending" } : current.direction === "ascending" ? { key, direction: "descending" } : null); }
  return <div className="admin-table-wrap" tabIndex={0}><table className="admin-table" data-admin-table><thead><tr>{columns.map((column) => { const active = sort?.key === column.key; return <th scope="col" key={column.key} aria-sort={active ? sort.direction : "none"}><button type="button" onClick={() => toggle(column.key)}><span>{column.label}</span>{active ? sort.direction === "ascending" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ChevronsUpDown size={13} />}</button></th>; })}</tr></thead><tbody>{sortedRows.map((row) => <tr key={row.id} data-href={row.href}>{columns.map((column, index) => <td key={column.key}>{index === 0 && row.href ? <a href={row.href}>{row.cells[column.key]}</a> : row.cells[column.key]}</td>)}</tr>)}</tbody></table></div>;
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (isValidElement<{ children?: ReactNode; value?: unknown }>(node)) return nodeText(node.props.children ?? (typeof node.props.value === "string" ? node.props.value : ""));
  return "";
}
function compare(a: string, b: string) { const left = Number(a.replaceAll(",", "")); const right = Number(b.replaceAll(",", "")); return Number.isFinite(left) && Number.isFinite(right) ? left - right : a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }
