import { createHash } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import { AdminResourcePage } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { ServiceRecoveryAction } from "@/components/admin/ServiceRecoveryAction";
import { getAdminLocale } from "@/lib/server/admin-locale";
import { recordAdminSensitiveAccess } from "@/lib/server/admin-sensitive-access";
import { redactServicePayload } from "@/lib/server/service-payload";

export default async function Page() {
  const locale = getAdminLocale(); const zh = locale === "zh";
  await recordAdminSensitiveAccess("System", "runtime", "effective-config-and-admin-sessions");
  const environment = getEnvironment();
  const [admins, backup, retention, operations, heartbeats, configurationChanges] = await Promise.all([
    prisma.adminUser.findMany({ select: { id: true, email: true, active: true, sessions: { select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, revokedAt: true }, where: { expiresAt: { gt: new Date() }, revokedAt: null }, orderBy: { createdAt: "desc" } } } }),
    prisma.auditEvent.findFirst({ where: { eventType: { in: ["backup_restore_verified", "production_backup_restore_verified"] }, payload: { path: ["environment"], equals: environment.NODE_ENV } }, orderBy: { createdAt: "desc" } }),
    prisma.auditEvent.findFirst({ where: { eventType: "evidence_retention_executed", entityId: environment.NODE_ENV }, orderBy: { createdAt: "desc" } }),
    prisma.serviceOperation.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.serviceRuntimeHeartbeat.findMany({ where: { environment: environment.NODE_ENV }, orderBy: { serviceId: "asc" } }),
    prisma.auditEvent.findMany({ where: { eventType: "runtime_configuration_observed", payload: { path: ["environment"], equals: environment.NODE_ENV } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const configuration = { environment: environment.NODE_ENV, scheduler: environment.SCHEDULER_ENABLED, highFrequency: environment.HIGH_FREQUENCY_SCHEDULER_ENABLED, provider: environment.PROVIDER_MODE, publicCollection: environment.PUBLIC_COLLECTION_MODE, autoPublish: environment.AUTO_PUBLISH_ENABLED, acceptChecks: environment.ACCEPT_NEW_CHECKS, billing: environment.BILLING_ENABLED, retentionHours: environment.RAW_ARTIFACT_TTL_HOURS, email: environment.EMAIL_PROVIDER };
  const configurationHash = createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
  return <><AdminResourcePage resource="settings" /><section className="admin-page"><div className="detail-sections"><section><h2>{zh ? "运行版本与配置证据" : "Runtime version and configuration evidence"}</h2><dl className="detail-list"><div><dt>{zh ? "实际发布版本" : "Release"}</dt><dd>{process.env.TYMRA_RELEASE_VERSION ?? "UNREPORTED"}</dd></div><div><dt>{zh ? "源码版本" : "Source revision"}</dt><dd>{process.env.TYMRA_SOURCE_REVISION ?? "UNREPORTED"}</dd></div><div><dt>{zh ? "生效配置指纹" : "Effective configuration fingerprint"}</dt><dd className="code-value">{configurationHash}</dd></div></dl><p>{zh ? "套餐定义、质量规则与算法通过受控发布维护；此处核对实际生效配置。" : "Plans, quality rules and algorithms are maintained through controlled releases. This view checks the effective runtime configuration."}</p></section>
    <section><h2>{zh ? "管理员权限与会话" : "Admin authority and sessions"}</h2><p>{zh ? "当前单运营者具有服务保障权限，业务输入和结论由客户流程与程序规则控制。会话最长 8 小时，可立即撤销。" : "The current operator has service assurance authority. Business input and conclusions follow customer workflows and program rules. Sessions expire within eight hours and can be revoked."}</p>{admins.map(admin => <article key={admin.id}><h3>{admin.email} · <StatusPill locale={locale} value={admin.active ? "ACTIVE" : "DISABLED"} /></h3>{admin.sessions.map(session => <details key={session.id}><summary>{session.id} · {session.lastSeenAt.toISOString()} → {session.expiresAt.toISOString()}</summary><ServiceRecoveryAction locale={locale} endpoint={`/api/v1/admin/sessions/${session.id}/actions`} action="REVOKE" label={zh ? "撤销此会话" : "Revoke this session"} confirmation={zh ? "撤销后此会话需重新登录，确定执行吗？" : "This session must sign in again after revocation. Continue?"} completedMessage={zh ? "会话已撤销。" : "Session revoked."} /></details>)}</article>)}</section>
    <section><h2>{zh ? "备份恢复与保留清理" : "Backup recovery and retention"}</h2><p>{zh ? "备份文件存在与恢复验证分别判断。仅显示本环境持久记录，缺少证据时保持未核实。" : "Backup existence and tested restoration are separate. Only persisted evidence from this environment is shown; missing proof remains unverified."}</p><dl className="detail-list"><div><dt>{zh ? "最近恢复验证" : "Latest restoration verification"}</dt><dd>{backup ? backup.createdAt.toISOString() : "NOT_VERIFIED"}</dd></div><div><dt>{zh ? "最近保留清理记录" : "Latest retention record"}</dt><dd>{retention ? retention.createdAt.toISOString() : "NOT_VERIFIED"}</dd></div></dl>{backup ? <pre className="evidence-block">{JSON.stringify(redactServicePayload(backup.payload), null, 2)}</pre> : null}</section>
    <section><h2>{zh ? "实际进程与配置变更" : "Actual processes and configuration changes"}</h2>{heartbeats.map(row => <p key={row.serviceId}>{row.serviceId} · {row.status} · {row.observedAt.toISOString()} · {row.releaseVersion} · {row.sourceRevision}</p>)}{!heartbeats.length ? <p>NOT_VERIFIED</p> : null}{configurationChanges.map(row => <details key={row.id}><summary>{row.createdAt.toISOString()} · {row.entityId}</summary><pre className="evidence-block">{JSON.stringify(redactServicePayload(row.payload), null, 2)}</pre></details>)}</section>
    <section><h2>{zh ? "来源控制记录" : "Source control records"}</h2>{operations.map(operation => <p key={operation.id}>{operation.createdAt.toISOString()} · {operation.sourceKey} · {operation.action} · {operation.id}</p>)}</section></div></section></>;
}
