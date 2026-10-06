"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../contracts";
import type { SettingsConfirmation } from "./SettingsView";

export function SettingsConfirmationDialog({ action, locale, onCancel, onConfirm }: { action: SettingsConfirmation; locale: Locale; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isDelete = action === "delete-account";
  const title = isDelete
    ? locale === "zh" ? "申请删除账户？" : "Request account deletion?"
    : locale === "zh" ? "退出所有设备？" : "Sign out all devices?";
  const body = isDelete
    ? locale === "zh" ? "提交后，账户删除流程将进入人工处理。此操作不会立即删除账户，但会创建一条正式请求。" : "This creates a formal account-deletion request for review. Your account is not deleted immediately."
    : locale === "zh" ? "确认后，当前设备和其他所有设备上的登录会话都会失效。" : "Your current session and every other signed-in device will be signed out."
  const confirmLabel = isDelete
    ? locale === "zh" ? "确认申请删除" : "Confirm deletion request"
    : locale === "zh" ? "退出所有设备" : "Sign out all devices";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => cancelRef.current?.focus({ preventScroll: true }));
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      if (event.shiftKey && document.activeElement === cancelRef.current) {
        event.preventDefault();
        confirmRef.current?.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
        event.preventDefault();
        cancelRef.current?.focus({ preventScroll: true });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCancel]);

  return createPortal(
    <div className="settings-confirm-backdrop" role="presentation" onClick={onCancel}>
      <section className="settings-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-confirm-title" aria-describedby="settings-confirm-body" onClick={(event) => event.stopPropagation()}>
        <span className={`settings-confirm-icon ${isDelete ? "is-danger" : ""}`} aria-hidden="true">{isDelete ? "!" : "✓"}</span>
        <h2 id="settings-confirm-title">{title}</h2>
        <p id="settings-confirm-body">{body}</p>
        <div className="settings-confirm-actions">
          <button ref={cancelRef} className="button button-secondary" type="button" onClick={onCancel}>{locale === "zh" ? "取消" : "Cancel"}</button>
          <button ref={confirmRef} className={`button ${isDelete ? "button-danger" : "button-primary"}`} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
