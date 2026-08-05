# Tymra 当前实施计划

Last updated: 2026-08-06

## 基线与状态源

产品范围由 [`product/`](./product/README.md) 下的本地文档控制；五份 Google Docs 已迁移并删除。
当前实现和验证状态只在 [`traceability.md`](./traceability.md) 维护，稳定取舍写入
[`decisions.md`](./decisions.md)，带运行 ID 的历史结果保存在 `evidence/`。本页只维护下一步顺序。

当前代码仍采用清晰的单仓库边界：

```text
apps/
  web/                    Next.js 公共站点、客户流程、Admin 与 HTTP API
  worker/                 队列、Scheduler、Worker API、采集和 Argus 编排
packages/
  config/ db/ domain/ providers/ queue/
scripts/                  本地运维、验收与 Compose smoke
docs/                     产品、架构、采集、证据、决策和状态
```

## 2026-08-06 实际快照

- 当前交付包含 Argus 持久编排、公开来源验收、采集优化、Compose profile、安全与发布运维控制。
  Git 提交状态不作为功能或验收事实源。
- 本地 Compose 只保留 Web、Worker API、Worker、PostgreSQL、Redis 和 Mailpit；浏览器执行
  由独立 Argus 服务提供。Scheduler 容器未运行，数据库中启用的计划数为 0。
- Worker health/readiness 把 Argus 作为必需依赖。当前失败队列已分类：7 个 `FAILED` 中
  4 个为历史/外部来源不可用、1 个历史来源 ID、1 个 RBNZ 权限门禁、1 个历史邮件；72 个
  `DEAD_LETTER` 中 68 个是旧加密密钥下的邮件夹具、2 个是本轮修复前的 Argus 证据范围
  回归、2 个是本轮修复前的 Ticketek 详情失败。它们均不是当前调度任务，未擅自重放或删除。
- Argus health/readiness 通过；数据库迁移
  `20260729093000_argus_execution_orchestration` 已应用，存在 33 个 `COMPLETED` 和 1 个
  `CANCELLED` 的 `ArgusExecution`，没有活动执行。
- Tymra Web/API/Worker 已用当前工作树重建，Web、Worker 和 Argus HTTPS health/readiness
  返回 HTTP 200。School Sport 两轮跨服务实采通过；Argus 修复 Ticketek umbrella detail 后，
  Ticketek listing/detail 两轮均成功且第二轮零增长。

## 当前优先级

| 优先级 | 工作 | 完成条件 | 当前状态 |
| --- | --- | --- | --- |
| P0 | 收口当前实现 | 删除两个带 ` 2` 的 Argus 旧副本；审查最终 diff；只保留唯一异步 Job client/test | 已完成 |
| P0 | 完成当前工作树质量门槛 | 专用测试库上的 `pnpm verify` 和完整 `pnpm test:e2e` 通过 | 已通过：lint、类型、113 个根测试（4 个 provider fixture 跳过）、60 个 Worker 测试、63 个数据库/API/Worker 集成测试和生产构建；桌面/移动各 9 个 E2E 通过 |
| P0 | 核对本地运行栈与失败队列 | 当前工作树容器 health/readiness、迁移、队列与 Argus 恢复一致；历史失败已分类 | 已完成只读分类；未重放或删除历史/验收任务 |
| P0 | 保持首页现有视觉与交互 | EN/ZH 桌面与移动端真实渲染、关键交互、可访问性和无横向溢出 | 已完成完整桌面/移动 E2E、axe 与真实 Browser 检查；无 console error |
| P1 | 公开来源回归 | 在 Scheduler 关闭和专用开发数据边界下重跑全部来源两轮验收 | 34 个来源、68 pass 全部通过；第二轮均零增长，Argus execution 全部收口 |
| P1 | Eventfinda 长期稳定性 | 目标环境全国持久抓取、多日无人值守、恢复、容量和告警证据 | 本地 5 轮 soak 已通过且零增长；长期验收待部署环境 |
| P1 | Ticketmaster 实页稳定性 | 挑战冷却后重复有界实页验收，列表优先且无绕过 | 列表优先实现和自动化已通过；详情实页仍受外部挑战条件限制 |
| P1 | 手工导入真实文件验收 | 真实运营导出文件完成两次持久化验收 | `not_verified`：缺少真实文件 |
| P1 | Release 1.5 剩余项 | Retention、匿名漏斗分析、挑战/配额/会话边界测试完成 | 本地 deterministic challenge 握手、neutral timing、retention、聚合分析、会话、consent、quota、reduced-motion 和回滚均已验证；生产 challenge vendor 与最终隐私批准仍是外部门槛 |
| P1 | Event impact v1 | 结构化证据、可信场馆 enrichment、真实样本 pending/promotion 和两轮幂等 | 已完成；Canterbury A&P Show 70,000 人官方证据实采提升，Te Pae 容量单独保持 pending；5 轮/10 pass 本地 soak 无 source/link 增长 |
| P2 | 生产采集启用 | 完成来源、容量、监控、回滚、安全和生产运维验收 | 未启动；本地验收不等于生产批准 |

## 交付顺序

1. 先收口重复文件并审查未提交 diff，避免旧同步 Argus client 被误提交或以后被测试发现规则漏掉。
2. 使用专用测试数据库运行当前工作树的 `pnpm verify`；UI 有变化时额外运行 `pnpm test:e2e`。
3. 用当前工作树重建本地 Compose 应用，再核对 `/worker/health`、`/worker/readiness`、
   Argus health/readiness、迁移状态和队列失败分类。
4. 在 Scheduler 关闭、边界固定且不会覆盖用户数据库的条件下，重跑公开来源两轮真实验收。
5. 在本地演练 Release 1.5 新入口暂停/恢复，确认旧结果链接的期限和权限边界不变。
6. 本地门槛通过后，再在目标环境分别完成 Eventfinda 多日无人值守、生产来源 canary 和回滚验收。
7. 只有实际证据完成后才更新 `traceability.md`；历史 evidence 文件不回写成实时状态。

## 已知边界

- OTA 费率来源目前只有 URL/fixture 与确定性研究适配器，没有可声明为生产可用的实采实现。
- Eventfinda 本地环境可验证实现、持久化、幂等、锁、租约和恢复逻辑，不能替代多日无人值守验收。
- Ticketmaster 公开页面可能进入验证挑战；实现必须停止、冷却并保留证据，不得绕过。
- 手工导入仍需要真实运营文件才能完成真实文件验收。
- 当前宿主机默认 `PATH` 没有 Node.js；本轮通过 Codex workspace Node runtime 和项目 Docker
  Node 24 镜像完成验证。
- 当前 revision 的隔离 Compose smoke 已完成镜像构建、迁移、seed、Web、Worker API、Worker、
  PostgreSQL、Redis 和 Mailpit 健康检查，并自动清理临时容器与卷。
- 2026-08-06 统一 34 来源真实验收完成 68 pass，失败为 0，第二轮全部零增长；Eventfinda
  额外 5 轮 soak 全部通过。该结果仍不替代目标环境多日无人值守验收。
- `evidence/` 中的 2026-07-21 与 2026-07-30 结果都是历史快照，不代表今天的外部来源持续可用。
