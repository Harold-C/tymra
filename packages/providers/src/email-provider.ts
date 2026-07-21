import nodemailer from "nodemailer";

import type { EmailType, Locale } from "@tymra/domain";

export type EmailMessage = {
  type: EmailType;
  locale: Locale;
  recipient: string;
  recipientHash: string;
  from: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailSendResult = {
  providerMessageId: string;
  accepted: boolean;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class LogEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    process.stdout.write(
      JSON.stringify({
        service: "tymra-email",
        event: "email_logged",
        type: message.type,
        locale: message.locale,
        recipientHash: message.recipientHash,
      }) + "\n",
    );
    return { providerMessageId: `log:${message.recipientHash.slice(0, 12)}:${message.type}`, accepted: true };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: nodemailer.Transporter;

  constructor(smtpUrl: string) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const result = await this.transport.sendMail({
      from: message.from,
      to: message.recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { providerMessageId: result.messageId, accepted: result.accepted.length > 0 };
  }
}

const emailCopy: Record<Locale, Record<EmailType, { subject: string; heading: string }>> = {
  en: {
    VERIFY_AND_SIGN_IN: { subject: "Verify your email to unlock the Tymra report", heading: "Verify your email and open your secure report" },
    CHECK_RECEIVED: { subject: "Tymra received your Price Check", heading: "Your Price Check has been received" },
    CONFIRMATION_REQUIRED: { subject: "Tymra needs one confirmation", heading: "One detail needs your confirmation" },
    CHECK_PROCESSING: { subject: "Your Tymra Price Check is processing", heading: "Your Price Check is in progress" },
    RESULT_READY: { subject: "Your Tymra result is ready", heading: "Your Price Check result is ready" },
    PARTIAL_RESULT: { subject: "Your partial Tymra result is ready", heading: "A partial result is available" },
    INSUFFICIENT_DATA: { subject: "Tymra completed your check", heading: "There was not enough reliable data to advise" },
    CHECK_FAILED: { subject: "Tymra could not complete your check", heading: "Your Price Check could not be completed" },
    LINK_REISSUED: { subject: "Your new Tymra result link", heading: "A new secure result link is ready" },
  },
  zh: {
    VERIFY_AND_SIGN_IN: { subject: "验证邮箱并解锁 Tymra 正式报告", heading: "验证邮箱并打开你的安全报告" },
    CHECK_RECEIVED: { subject: "Tymra 已收到你的价格检查", heading: "你的价格检查已收到" },
    CONFIRMATION_REQUIRED: { subject: "Tymra 需要你确认一项信息", heading: "有一项信息需要确认" },
    CHECK_PROCESSING: { subject: "Tymra 正在处理你的价格检查", heading: "你的价格检查正在进行" },
    RESULT_READY: { subject: "你的 Tymra 结果已生成", heading: "你的价格检查结果已生成" },
    PARTIAL_RESULT: { subject: "你的 Tymra 部分结果已生成", heading: "已有部分可靠结果" },
    INSUFFICIENT_DATA: { subject: "Tymra 已完成检查", heading: "目前没有足够可靠的数据提供建议" },
    CHECK_FAILED: { subject: "Tymra 无法完成本次检查", heading: "本次价格检查未能完成" },
    LINK_REISSUED: { subject: "新的 Tymra 结果链接", heading: "新的安全结果链接已生成" },
  },
};

export function buildServiceEmail(input: {
  type: EmailType;
  locale: Locale;
  recipient: string;
  recipientHash: string;
  from: string;
  safeActionUrl?: string;
  referenceId: string;
}): EmailMessage {
  const copy = emailCopy[input.locale][input.type];
  const action = input.safeActionUrl
    ? input.locale === "zh"
      ? `\n查看安全页面：${input.safeActionUrl}`
      : `\nOpen the secure page: ${input.safeActionUrl}`
    : "";
  const footer = input.locale === "zh" ? `参考编号：${input.referenceId}` : `Reference: ${input.referenceId}`;
  const text = `${copy.heading}\n${action}\n\n${footer}`;

  return {
    type: input.type,
    locale: input.locale,
    recipient: input.recipient,
    recipientHash: input.recipientHash,
    from: input.from,
    subject: copy.subject,
    text,
    html: `<h1>${escapeHtml(copy.heading)}</h1>${input.safeActionUrl ? `<p><a href="${escapeHtml(input.safeActionUrl)}">${input.locale === "zh" ? "查看安全页面" : "Open secure page"}</a></p>` : ""}<p>${escapeHtml(footer)}</p>`,
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
