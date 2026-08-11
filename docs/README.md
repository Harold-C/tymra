# Tymra 文档索引

本目录是项目文档和本地记忆的唯一入口。当前实现状态以[追踪表](./traceability.md)为准；当前工作重点以[实施计划](./implementation-plan.md)为准；历史验收结果保存在 `evidence/`，不要把历史快照当作实时状态。

## 记忆口径

- `product/` 保存产品意图和已迁移的五份 Google 文档基线，不随一次运行结果改写。
- `traceability.md` 保存当前实现、当前工作树验证状态和尚未完成的边界，是状态事实源。
- `implementation-plan.md` 保存下一步顺序、完成条件和当前风险，不重复维护需求全文。
- `decisions.md` 保存稳定的产品与技术取舍；`evidence/` 只保存带日期的不可变验收快照。
- 根目录 `README.md` 只负责启动、运行和验证入口。聊天记录不替代上述本地文件。

## 产品

- [产品基线与五份 Google 文档迁移清单](./product/README.md)
- [需求说明](./product/requirements.md)
- [业务规则](./product/business-rules.md)
- [页面结构](./product/page-structure.md)
- [视觉与交互](./product/visual-interaction.md)
- [核心策略](./product/core-strategy.md)
- [Release 1.5 客户漏斗](./product/customer-funnel.md)
- [会员方案与完整功能合同](./product/membership-plans.md)

## 架构

- [代码库目录与模块边界](./architecture/codebase.md)
- [Worker 架构](./architecture/worker.md)
- [Argus 浏览器执行边界](./collection/argus.md)

## 数据采集

- [本地验收标准](./collection/acceptance.md)
- [Argus 浏览器执行边界](./collection/argus.md)
- [非 OTA 公共数据采集](./collection/public-data.md)
- [事件房价影响数据契约](./collection/event-impact-data-contract.md)
- [Eventfinda](./collection/eventfinda.md)
- [Ticketmaster](./collection/ticketmaster.md)
- [直连事件与机场来源](./collection/direct-event-sources.md)
- [全国主要住宿市场公开信号覆盖](./collection/nz-market-public-signal-coverage.md)
- [Argus 任务职责](./collection/argus-responsibilities.md)
- [手工导入](./collection/manual-import.md)
- [2026-07-21 本地采集验收快照](./evidence/collection-acceptance-2026-07-21.md)
- [2026-07-30 全部非 OTA 公开来源验收](./evidence/public-source-acceptance-2026-07-30.md)
- [2026-08-01 ARGUS-023 结果确认与清理验收](./evidence/argus-023-acceptance-2026-08-01.md)
- [2026-08-06 生产就绪工具验收](./evidence/production-readiness-tooling-2026-08-06.md)
- [2026-08-02 Argus-only 切换验收](./evidence/argus-only-cutover-2026-08-02.md)
- [2026-08-05 非 OTA 采集任务归档与交接](./evidence/non-ota-collection-task-archive-2026-08-05.md)
- [2026-08-11 Free 会员端到端开发验收](./evidence/free-member-end-to-end-acceptance-2026-08-11.md)

## 治理与执行

- [产品与技术决策](./decisions.md)
- [当前实施计划](./implementation-plan.md)
- [需求、实现与验收追踪](./traceability.md)
