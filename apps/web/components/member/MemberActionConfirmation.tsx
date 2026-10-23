"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function MemberActionConfirmation({ title, body, cancelLabel, confirmLabel, onCancel, onConfirm }: { title: string; body: string; cancelLabel: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
      if (event.key === "Tab" && event.shiftKey && document.activeElement === cancelRef.current) { event.preventDefault(); confirmRef.current?.focus(); }
      else if (event.key === "Tab" && !event.shiftKey && document.activeElement === confirmRef.current) { event.preventDefault(); cancelRef.current?.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", keydown); previousFocus?.focus({ preventScroll: true }); };
  }, [onCancel]);
  return createPortal(<div className="settings-confirm-backdrop" onClick={onCancel} role="presentation"><section className="settings-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="member-confirm-title" aria-describedby="member-confirm-body" onClick={(event) => event.stopPropagation()}><h2 id="member-confirm-title">{title}</h2><p id="member-confirm-body">{body}</p><div className="settings-confirm-actions"><button ref={cancelRef} type="button" className="button button-secondary" onClick={onCancel}>{cancelLabel}</button><button ref={confirmRef} type="button" className="button button-primary" onClick={onConfirm}>{confirmLabel}</button></div></section></div>, document.body);
}
