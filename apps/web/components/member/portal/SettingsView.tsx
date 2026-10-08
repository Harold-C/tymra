"use client";

import { AlertTriangle, CheckCircle2, Download, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Page, Loading, ErrorState } from "./shared";
import type { Locale } from "../contracts";
import { api } from "./api";
import { SettingsConfirmationDialog } from "./SettingsConfirmationDialog";

export type SettingsData = { email: string; locale: Locale; marketingConsent: boolean; hasPassword: boolean; emailVerified: boolean; benefitGroupId: string | null; dataRequests: Array<{ id: string; type: string; status: string; requestedAt: string; exportReadyAt?: string | null; exportExpiresAt?: string | null; downloadedAt?: string | null }> };

export type SettingsFeedback = { target: "profile" | "security" | "data"; kind: "success" | "error"; message: string };

export type SettingsConfirmation = "sign-out-all" | "delete-account";

export function SettingsNotice({ feedback }: { feedback: SettingsFeedback | null }) {
  if (!feedback) return null;
  return <div className={`flow-notice settings-feedback ${feedback.kind === "success" ? "notice-success" : "notice-danger"}`} role={feedback.kind === "success" ? "status" : "alert"}>{feedback.kind === "success" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}<div><p>{feedback.message}</p></div></div>;
}

export function SettingsView({ locale }: { locale: Locale }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [savedPreferences, setSavedPreferences] = useState<Pick<SettingsData, "locale" | "marketingConsent"> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SettingsFeedback | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<SettingsConfirmation | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const load = useCallback(async () => {
    try {
      const nextData = await api<SettingsData>("/api/v1/customer/settings");
      setData(nextData);
      setSavedPreferences({ locale: nextData.locale, marketingConsent: nextData.marketingConsent });
      setLoadError(null);
    } catch (caught) {
      setLoadError(String((caught as Error).message));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const preferencesChanged = Boolean(data && savedPreferences && (data.locale !== savedPreferences.locale || data.marketingConsent !== savedPreferences.marketingConsent));

  const save = async () => {
    if (!data || !preferencesChanged || busyAction) return;
    setBusyAction("save"); setFeedback(null);
    try {
      await api("/api/v1/customer/settings", { method: "PATCH", body: JSON.stringify({ locale: data.locale, marketingConsent: data.marketingConsent }) });
      setSavedPreferences({ locale: data.locale, marketingConsent: data.marketingConsent });
      setFeedback({ target: "profile", kind: "success", message: locale === "zh" ? "设置已保存。" : "Settings saved." });
    } catch (caught) {
      setFeedback({ target: "profile", kind: "error", message: String((caught as Error).message) });
    } finally { setBusyAction(null); }
  };
  const requestData = async (type: "EXPORT" | "DELETE") => {
    setConfirmation(null); setBusyAction(type); setFeedback(null);
    try {
      await api("/api/v1/customer/settings", { method: "POST", body: JSON.stringify({ type }) });
      setFeedback({ target: "data", kind: "success", message: type === "DELETE" ? locale === "zh" ? "账户删除申请已提交。" : "Account deletion request submitted." : locale === "zh" ? "数据导出申请已提交。" : "Data export request submitted." });
      await load();
    } catch (caught) {
      setFeedback({ target: "data", kind: "error", message: String((caught as Error).message) });
    } finally { setBusyAction(null); }
  };
  const resendVerification = async () => {
    setBusyAction("verify"); setFeedback(null);
    try {
      await api("/api/v1/customer/auth/verify-email", { method: "POST", body: "{}" });
      setFeedback({ target: "profile", kind: "success", message: locale === "zh" ? "验证邮件已发送。" : "Verification email sent." });
    } catch (caught) {
      setFeedback({ target: "profile", kind: "error", message: String((caught as Error).message) });
    } finally { setBusyAction(null); }
  };
  const changePassword = async () => {
    if (newPassword !== confirmPassword) return setFeedback({ target: "security", kind: "error", message: locale === "zh" ? "两次输入的新密码不一致。" : "The new passwords do not match." });
    setBusyAction("password"); setFeedback(null);
    try {
      await api("/api/v1/customer/auth/password", { method: "PUT", body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }) });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setFeedback({ target: "security", kind: "success", message: locale === "zh" ? "密码已更新，其他设备已退出。" : "Password updated. Other devices have been signed out." });
      await load();
    } catch (caught) {
      setFeedback({ target: "security", kind: "error", message: String((caught as Error).message) });
    } finally { setBusyAction(null); }
  };
  const signOutAll = async () => {
    setConfirmation(null); setBusyAction("sign-out"); setFeedback(null);
    try {
      await api("/api/v1/customer/session", { method: "DELETE", body: JSON.stringify({ allSessions: true }) });
      window.location.assign(`/${locale}`);
    } catch (caught) {
      setFeedback({ target: "security", kind: "error", message: String((caught as Error).message) });
      setBusyAction(null);
    }
  };
  return <Page locale={locale} eyebrow={locale === "zh" ? "账户" : "ACCOUNT"} title={locale === "zh" ? "账户设置" : "Account settings"} body={locale === "zh" ? "管理语言、独立营销同意、会话及个人数据请求。" : "Manage language, separate marketing consent, sessions and personal-data requests."}>
    {loadError ? <ErrorState message={loadError} /> : !data ? <Loading locale={locale} /> : <div className="settings-grid">
      <section><h2>{locale === "zh" ? "资料与偏好" : "Profile and preferences"}</h2><label><span>Email · {data.emailVerified ? locale === "zh" ? "已验证" : "VERIFIED" : locale === "zh" ? "未验证" : "UNVERIFIED"}</span><input value={data.email} disabled /></label>{!data.emailVerified ? <button className="button button-secondary" disabled={busyAction !== null} onClick={() => void resendVerification()}>{locale === "zh" ? "重新发送验证邮件" : "Resend verification email"}</button> : null}<label><span>{locale === "zh" ? "语言" : "Language"}</span><select value={data.locale} onChange={(event) => setData({ ...data, locale: event.target.value as Locale })}><option value="en">English</option><option value="zh">中文</option></select></label><label className="checkbox-row"><input type="checkbox" checked={data.marketingConsent} onChange={(event) => setData({ ...data, marketingConsent: event.target.checked })} /><span>{locale === "zh" ? "接收营销信息（不影响服务邮件）" : "Receive marketing messages (service emails remain separate)"}</span></label><button className="button button-primary" disabled={!preferencesChanged || busyAction !== null} onClick={() => void save()}>{busyAction === "save" ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{locale === "zh" ? "保存" : "Save"}</button><SettingsNotice feedback={feedback?.target === "profile" ? feedback : null} /></section>
      <section><h2>{locale === "zh" ? "密码与安全" : "Password and security"}</h2>{data.hasPassword ? <label><span>{locale === "zh" ? "当前密码" : "Current password"}</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label> : null}<label><span>{locale === "zh" ? "新密码（至少 12 个字符）" : "New password (12+ characters)"}</span><input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label><span>{locale === "zh" ? "确认新密码" : "Confirm new password"}</span><input type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><button className="button button-primary" disabled={busyAction !== null || newPassword.length < 12 || (data.hasPassword && !currentPassword)} onClick={() => void changePassword()}>{busyAction === "password" ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{data.hasPassword ? locale === "zh" ? "修改密码" : "Change password" : locale === "zh" ? "创建密码" : "Create password"}</button><button className="button button-secondary" disabled={busyAction !== null} onClick={() => setConfirmation("sign-out-all")}>{locale === "zh" ? "退出所有设备" : "Sign out all devices"}</button><SettingsNotice feedback={feedback?.target === "security" ? feedback : null} /></section>
      <section><h2>{locale === "zh" ? "个人数据" : "Personal data"}</h2><button className="button button-secondary" disabled={busyAction !== null} onClick={() => void requestData("EXPORT")}><Download aria-hidden="true" />{busyAction === "EXPORT" ? locale === "zh" ? "正在提交…" : "Submitting…" : locale === "zh" ? "申请数据导出" : "Request data export"}</button><button className="button button-secondary danger" disabled={busyAction !== null} onClick={() => setConfirmation("delete-account")}>{locale === "zh" ? "申请删除账户" : "Request account deletion"}</button><SettingsNotice feedback={feedback?.target === "data" ? feedback : null} />{data.dataRequests.length ? <ul className="data-request-list">{data.dataRequests.map((item) => <li key={item.id}><span>{item.type === "EXPORT" ? locale === "zh" ? "数据导出" : "Data export" : item.type === "DELETE" ? locale === "zh" ? "账户删除" : "Account deletion" : item.type}</span><strong>{item.status}</strong>{item.type === "EXPORT" && item.exportReadyAt && item.exportExpiresAt && new Date(item.exportExpiresAt) > new Date() ? <a className="button button-secondary" href={`/api/v1/customer/data-requests/${item.id}/download`}>{locale === "zh" ? "下载个人数据" : "Download personal data"}</a> : null}</li>)}</ul> : null}</section>
    </div>}
    <RiskAppeals locale={locale} />
    {confirmation ? <SettingsConfirmationDialog action={confirmation} locale={locale} onCancel={() => setConfirmation(null)} onConfirm={() => { if (confirmation === "delete-account") void requestData("DELETE"); else void signOutAll(); }} /> : null}
  </Page>;
}

export function RiskAppeals({ locale }: { locale: Locale }) {
  type RiskCase = { id: string; status: string; outcome: string; action: string; reasonCodes: string[]; cooldownUntil: string | null; appealReason: string | null };
  const [cases, setCases] = useState<RiskCase[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => api<{ cases: RiskCase[] }>("/api/v1/customer/risk").then((value) => setCases(value.cases)), []);
  useEffect(() => { void load(); }, [load]);
  const appeal = async (caseId: string) => {
    try {
      await api("/api/v1/customer/risk", { method: "POST", body: JSON.stringify({ caseId, reason: reasons[caseId] ?? "" }) });
      setMessage(locale === "zh" ? "申诉已提交，采集限制将在复核后更新。" : "Appeal submitted. Collection restrictions update after review.");
      await load();
    } catch (caught) { setMessage(String((caught as Error).message)); }
  };
  const openCases = cases?.filter((item) => item.status === "OPEN") ?? [];
  if (!cases || openCases.length === 0) return null;
  return <section className="settings-grid"><section><h2>{locale === "zh" ? "采集限制与申诉" : "Collection restrictions and appeals"}</h2>{openCases.map((item) => <div key={item.id}><p><strong>{item.action} · {item.outcome}</strong><br />{item.reasonCodes.join(", ")}</p>{item.appealReason ? <p>{locale === "zh" ? "申诉已提交" : "Appeal submitted"}: {item.appealReason}</p> : <><label><span>{locale === "zh" ? "说明合法使用场景（至少 20 字）" : "Explain the legitimate use case (20+ characters)"}</span><textarea value={reasons[item.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [item.id]: event.target.value })} minLength={20} maxLength={2_000} /></label><button className="button button-secondary" disabled={(reasons[item.id]?.trim().length ?? 0) < 20} onClick={() => void appeal(item.id)}>{locale === "zh" ? "提交申诉" : "Submit appeal"}</button></>}</div>)}</section>{message ? <p>{message}</p> : null}</section>;
}
