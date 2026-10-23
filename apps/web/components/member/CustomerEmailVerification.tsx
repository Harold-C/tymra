"use client";

import { CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const messages = {
  en: {
    title: "Verify your account email",
    body: "Your Free account is ready. Verify your email before starting a price check. You can sign out and sign back in with your password.",
    sent: "Verification email sent. Check your inbox and spam folder, then open the link to verify your email.",
    failed: "Your account was created, but the verification email could not be sent. You can request another email here.",
    unavailable: "The verification email could not be sent. Please try again later.",
    limited: "Please wait before requesting another verification email.",
    resend: "Send verification email",
    sending: "Sending…",
    verified: "Your email is verified.",
  },
  zh: {
    title: "验证账户邮箱",
    body: "你的 Free 账户已建立。开始价格检查前，请先验证邮箱。你可以退出后随时使用密码重新登录。",
    sent: "验证邮件已发送，请检查收件箱及垃圾邮件，并点击邮件中的链接完成验证。",
    failed: "账户已建立，但验证邮件未能发送。你可以在这里重新获取验证邮件。",
    unavailable: "验证邮件暂时无法发送，请稍后重试。",
    limited: "验证邮件请求过于频繁，请稍后重试。",
    resend: "发送验证邮件",
    sending: "正在发送…",
    verified: "你的邮箱已验证。",
  },
};

export function CustomerEmailVerification({ locale, verified, delivery }: {
  locale: "en" | "zh";
  verified: boolean;
  delivery?: "sent" | "unavailable";
}) {
  const copy = messages[locale];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(
    delivery ? { error: delivery === "unavailable", text: delivery === "sent" ? copy.sent : copy.failed } : null,
  );

  async function resend() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/v1/customer/auth/verify-email", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const payload = await response.json().catch(() => null) as { data?: { accepted: boolean; alreadyVerified: boolean }; error?: { code: string } } | null;
      if (!response.ok || !payload?.data?.accepted) {
        setFeedback({ error: true, text: payload?.error?.code === "RATE_LIMITED" ? copy.limited : copy.unavailable });
      } else if (payload.data.alreadyVerified) {
        router.refresh();
      } else {
        setFeedback({ error: false, text: copy.sent });
      }
    } catch {
      setFeedback({ error: true, text: copy.unavailable });
    } finally {
      setBusy(false);
    }
  }

  if (verified) return <div className="flow-notice notice-success" role="status"><CheckCircle2 aria-hidden="true" /><p>{copy.verified}</p></div>;
  return <section className="flow-notice notice-warning" aria-labelledby="customer-email-verification-title">
    <Mail aria-hidden="true" />
    <div>
      <strong id="customer-email-verification-title">{copy.title}</strong>
      <p>{copy.body}</p>
      {feedback ? <p role={feedback.error ? "alert" : "status"}>{feedback.text}</p> : null}
      <button className="button button-secondary" disabled={busy} onClick={() => void resend()}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{copy[busy ? "sending" : "resend"]}</button>
    </div>
  </section>;
}
