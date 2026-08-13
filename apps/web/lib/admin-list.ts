import type { AdminLocale } from "./admin-i18n";

export const adminPageSizes = [25, 50, 100] as const;
export const defaultAdminPageSize = 25;

export function adminListState(searchParams: Record<string, string | undefined>) {
  const page = positiveInteger(searchParams.page, 1);
  const requestedSize = positiveInteger(searchParams.pageSize, defaultAdminPageSize);
  const pageSize = adminPageSizes.includes(requestedSize as (typeof adminPageSizes)[number])
    ? requestedSize
    : defaultAdminPageSize;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function adminListHref(pathname: string, searchParams: Record<string, string | undefined>, changes: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) if (value && !(key in changes)) query.set(key, value);
  for (const [key, value] of Object.entries(changes)) if (value !== undefined && value !== "") query.set(key, String(value));
  const serialized = query.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

export function adminListCopy(locale: AdminLocale) {
  return locale === "zh"
    ? { results: "匹配结果", count: "共 {count} 条", previous: "上一页", next: "下一页", page: "第 {page} / {total} 页", perPage: "每页", pagination: "列表分页" }
    : { results: "Matching results", count: "{count} records", previous: "Previous", next: "Next", page: "Page {page} of {total}", perPage: "Per page", pagination: "List pagination" };
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
