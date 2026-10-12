import { getEnvironment } from "@tymra/config";
import { decryptPersonalData, encryptPersonalData, prisma, type Prisma } from "@tymra/db";
import ExcelJS from "exceljs";
import { ensureEffectiveMembership, membershipHistoryCutoff, MembershipAccessError, reserveMembershipOperation, runMembershipTransaction } from "./membership";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const columns = ["check_id", "status", "property", "unit", "check_in", "check_out", "source", "amount_minor", "currency", "price_basis", "fee_completeness", "source_url", "as_of", "price_result_status", "recommendation_status", "timezone", "created_at"];

export async function createMemberExport(customerUserId: string, idempotencyKey: string, exitExport = false) {
  if (!idempotencyKey.trim() || idempotencyKey.length > 128) throw new Error("A valid idempotency key is required.");
  const now = new Date();
  return runMembershipTransaction(async tx => {
    const operationKey = `${exitExport ? "MEMBER_EXIT_EXPORT" : "MEMBER_EXPORT"}:${customerUserId}:${idempotencyKey}`;
    const existing = await tx.usageLedger.findUnique({ where: { operationKey } });
    if (existing && record(existing.metadata).exportSnapshot) return { id: existing.id, createdAt: existing.createdAt };
    const customer = await tx.customerUser.findUniqueOrThrow({ where: { id: customerUserId } });
    if (!customer.emailVerifiedAt || customer.status !== "ACTIVE") throw new MembershipAccessError("EMAIL_VERIFICATION_REQUIRED");
    const membership = await ensureEffectiveMembership(tx, customerUserId, now);
    if (exitExport && (!membership.historyGraceUntil || membership.historyGraceUntil <= now)) throw new Error("Exit export is available during the history grace period.");
    const usage = exitExport ? await tx.usageLedger.create({ data: { customerUserId, operationKey, action: "MEMBER_EXIT_EXPORT", subjectType: "ACCOUNT", subjectHash: customerUserId, metadata: {} } }) : (await reserveMembershipOperation({ customerUserId, idempotencyKey, action: "MEMBER_EXPORT", now, transaction: tx })).usage;
    const checks = await tx.priceCheck.findMany({ where: { customerUserId, status: { not: "ARCHIVED" }, createdAt: { gte: membershipHistoryCutoff(membership, now) } }, orderBy: { createdAt: "desc" }, take: 5000,
      include: { property: { select: { canonicalName: true } }, unit: { select: { officialName: true } }, stayQuery: true, resultVersions: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1 } } });
    const rows = checks.flatMap(check => {
      const result = check.resultVersions[0];
      const observed = record(result?.payload).observedPrices;
      const prices: Record<string, unknown>[] = Array.isArray(observed) && observed.length ? observed.slice(0, 50).map(record) : [{}];
      return prices.map(price => [check.id, check.status, check.property?.canonicalName ?? "", check.unit?.officialName ?? "", check.stayQuery?.checkIn.toISOString().slice(0, 10) ?? "", check.stayQuery?.checkOut.toISOString().slice(0, 10) ?? "", price.source ?? "", price.amountMinor ?? "", price.currency ?? check.stayQuery?.currency ?? "NZD", price.basis ?? "", price.feeCompleteness ?? "", price.sourceUrl ?? "", price.asOf ?? result?.dataLastCheckedAt?.toISOString() ?? "", result?.priceResultStatus ?? "", result?.recommendationStatus ?? "", "Pacific/Auckland", check.createdAt.toISOString()].map(value => String(value)));
    });
    const expiresAt = exitExport ? membership.historyGraceUntil! : new Date(now.getTime() + 30 * 86400000);
    await tx.usageLedger.update({ where: { id: usage.id }, data: { metadata: { ...record(usage.metadata), exportSnapshot: encryptPersonalData(JSON.stringify([columns, ...rows]), getEnvironment().DATA_ENCRYPTION_KEY), exportExpiresAt: expiresAt.toISOString(), exportRowCount: rows.length, limit: 5000, truncated: checks.length === 5000 } as Prisma.InputJsonValue } });
    return { id: usage.id, createdAt: usage.createdAt, expiresAt, rowCount: rows.length, truncated: checks.length === 5000 };
  });
}

export async function listMemberExports(customerUserId: string) {
  const rows = await prisma.usageLedger.findMany({ where: { customerUserId, action: { in: ["MEMBER_EXPORT", "MEMBER_EXIT_EXPORT"] } }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.filter(row => typeof record(row.metadata).exportSnapshot === "string" && Date.parse(String(record(row.metadata).exportExpiresAt)) > Date.now()).map(row => ({ id: row.id, createdAt: row.createdAt, expiresAt: record(row.metadata).exportExpiresAt, rowCount: record(row.metadata).exportRowCount }));
}

export async function downloadMemberExport(customerUserId: string, id: string, format: "csv" | "xlsx") {
  const row = await prisma.usageLedger.findFirst({ where: { id, customerUserId, action: { in: ["MEMBER_EXPORT", "MEMBER_EXIT_EXPORT"] } } });
  const metadata = record(row?.metadata);
  if (!row || typeof metadata.exportSnapshot !== "string" || !(Date.parse(String(metadata.exportExpiresAt)) > Date.now())) return null;
  const rows = JSON.parse(decryptPersonalData(metadata.exportSnapshot, getEnvironment().DATA_ENCRYPTION_KEY)) as string[][];
  if (format === "csv") return { content: Buffer.from("\ufeff" + rows.map(cells => cells.map(csvCell).join(",")).join("\r\n")), contentType: "text/csv; charset=utf-8" };
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Price checks", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRows(rows); sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach(column => { column.width = 24; });
  return { content: Buffer.from(await workbook.xlsx.writeBuffer()), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

export function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
