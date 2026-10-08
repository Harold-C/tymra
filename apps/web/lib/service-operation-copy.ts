import type { ServiceExceptionAction } from "@tymra/domain";

import type { AdminLocale } from "./admin-i18n";

export function serviceActionCopy(locale: AdminLocale, action: ServiceExceptionAction) {
  const labels = locale === "zh" ? zh : en;
  return labels[action];
}

const en = {
  ACKNOWLEDGE: { title: "Take ownership", detail: "Record that this event is being investigated. Service health is unchanged." },
  RECOLLECT: { title: "Recover collection", detail: "Reuse the original request and query. Duplicate recovery work is prevented." },
  REANALYSE: { title: "Recover analysis", detail: "Rerun with the customer's original conditions and record a new result version." },
  REQUEST_USER_CONFIRMATION: { title: "Ask the customer to confirm", detail: "Return the request to its owner and send a confirmation notification." },
  WITHDRAW_RESULT: { title: "Withdraw incorrect result", detail: "Stop access and pending notification of the current published result. Evidence is retained." },
  VERIFY_RECOVERY: { title: "Verify recovery and close", detail: "Requires a completed recovery pipeline and a new accessible result." },
  DISMISS: { title: "Archive without recovery", detail: "Retain the evidence and reason. This does not mark the service healthy." },
};
const zh: typeof en = {
  ACKNOWLEDGE: { title: "接手调查", detail: "记录当前正在调查此事件，服务健康保持独立判断。" },
  RECOLLECT: { title: "恢复采集", detail: "保留客户原始输入和查询条件，避免重复恢复任务。" },
  REANALYSE: { title: "恢复分析", detail: "按客户原始条件重新计算，记录新的结果版本。" },
  REQUEST_USER_CONFIRMATION: { title: "请用户确认", detail: "将请求交回所属用户，并发送确认通知。" },
  WITHDRAW_RESULT: { title: "撤回错误结果", detail: "停止访问当前已发布结果及其待发通知，保留历史证据。" },
  VERIFY_RECOVERY: { title: "验证恢复并关闭", detail: "恢复任务完成且产生新的可访问结果后，才允许关闭事件。" },
  DISMISS: { title: "归档并记录原因", detail: "保留证据和原因，归档不会把服务标记为健康。" },
};

export function serviceErrorCopy(locale: AdminLocale, code: string | undefined = undefined) {
  const messages: Record<string, [string, string]> = {
    DELIVERY_OUTCOME_UNVERIFIED: ["The send outcome is unverified. Check provider evidence before any resend.", "发送结果尚未核实，请先查看提供方证据，不要重复发送。"],
    PROVIDER_REJECTED: ["The provider rejected the send. Correct the cause before recovering it.", "提供方拒绝发送，请先解决原因再恢复通知。"],
    RECOVERY_PIPELINE_INCOMPLETE: ["The recovery pipeline still has incomplete or failed runs.", "恢复流程仍有未完成或失败的运行。"],
    ARGUS_DELIVERY_UNVERIFIED: ["Saved evidence and Argus acknowledgement must both be verified.", "需要核实证据已保存及 Argus 交付已确认。"],
    SCHEDULE_CONTRACT_REJECTED: ["This schedule differs from the approved source policy.", "此计划与已批准的来源规则不一致。"],
    SOURCE_GATE_REJECTED: ["Source evidence, budget or execution limits currently block this action.", "来源证据、预算或执行限制尚未满足。"],
    SOURCE_PAUSED: ["The source is paused. Inspect its current evidence before resuming.", "来源已暂停，请先查看当前证据再恢复。"],
    SCHEDULER_RUNTIME_DISABLED: ["The scheduler is disabled in this runtime.", "当前环境的调度进程未启用。"],
    COLLECTION_ALREADY_ACTIVE: ["This source already has collection work in progress.", "该来源已有采集任务正在执行。"],
    COLLECTION_COOLDOWN: ["This source is still in its collection cooldown period.", "该来源仍在采集冷却期内。"],
    WAIVER_MAX_24_HOURS: ["A temporary waiver may last at most 24 hours.", "临时豁免最长只能持续 24 小时。"],
    REPAIR_PREVIEW_CHANGED: ["The affected data changed. Preview the repair again.", "受影响数据已变化，请重新预览修复影响。"],
    DUPLICATE_USAGE_NOT_PROVEN: ["The records do not prove a duplicate charge for the same owner and request.", "这些记录不足以证明同一用户及请求被重复扣额。"],
    EXPORT_NOT_AVAILABLE: ["The export is unavailable or expired. Check the data request.", "导出不可用或已过期，请查看个人数据请求。"],
    REQUEST_ALREADY_ACTIVE: ["This request still has active work. Wait for it to finish.", "此请求仍有执行中的任务，请等待其完成。"],
    JOB_NOT_RECOVERABLE: ["Only completed failed work can be recovered.", "只能恢复已结束的失败任务。"],
    JOB_NOT_CANCELLABLE: ["Only pending work for an unfinished request or source task can be cancelled.", "只能取消未完成请求或来源的待执行任务。"],
    USE_BACKFILL_CANCELLATION: ["Cancel this import from its historical backfill detail.", "请从对应历史回填详情取消此导入。"],
    RESULT_ALREADY_PUBLISHED: ["A published result must use the evidenced withdrawal process.", "已发布结果需要通过有证据的撤回流程处理。"],
    ORIGINAL_RECOVERY_JOB_NOT_FOUND: ["No original task exists for this recovery action. Inspect the request's task history.", "未找到此动作对应的原始任务，请查看请求的任务历史。"],
    RECOVERY_EVIDENCE_REQUIRED: ["Request a recovery action before verifying its outcome.", "请先执行恢复动作，再验证实际结果。"],
    RECOVERY_JOB_NOT_SUCCEEDED: ["The recovery job has not succeeded yet.", "恢复任务尚未成功。"],
    PIPELINE_STILL_ACTIVE: ["The downstream pipeline is still active.", "后续处理流程仍在执行。"],
    BLOCKING_EXCEPTION_REMAINS: ["Another blocking incident still needs attention.", "仍有其他阻塞事件需要处理。"],
    REQUEST_NOT_DELIVERABLE: ["The request has not reached an accessible result.", "请求尚未产生可交付结果。"],
    NO_NEW_PUBLISHED_RESULT: ["A new accessible result is required; the old result is not recovery evidence.", "需要新的可访问结果，旧结果不能证明本次恢复。"],
    NO_SUCCESSFUL_RECOVERY_RUN: ["The matching recovery collection run has not succeeded.", "对应来源的恢复采集运行尚未成功。"],
    RESULT_NOT_DELIVERABLE: ["The result is withdrawn or superseded. Its notification cannot be resent.", "该结果已撤回或被替代，不能补发通知。"],
    DELIVERY_NOT_RECOVERABLE: ["This notification was already sent or cancelled.", "该通知已经发送或取消。"],
    DELIVERY_ALREADY_ACTIVE: ["This notification is already being processed.", "该通知已在处理中。"],
    SERVICE_ACTION_FORBIDDEN: ["This action is outside service support or the current event state.", "此动作不符合服务支持职责或当前事件状态。"],
  };
  const value = messages[code ?? ""];
  return value ? value[locale === "zh" ? 1 : 0] : locale === "zh" ? "操作未完成，请刷新查看当前状态和证据。" : "The action could not be completed. Refresh and inspect the current state and evidence.";
}
