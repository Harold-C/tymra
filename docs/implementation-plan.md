# Tymra 当前实施计划

Last updated: 2026-08-02

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

## 2026-08-01 实际快照

- 当前交付包含 Argus 持久编排、公开来源验收、采集优化、Compose profile 和文档改动。
  Git 提交状态不作为功能或验收事实源。
- 本地 Compose 只保留 Web、Worker API、Worker、PostgreSQL、Redis 和 Mailpit；浏览器执行
  由独立 Argus 服务提供。Scheduler 容器未运行，数据库中启用的计划数为 0。
- Worker health/readiness 现在把 Argus 作为必需依赖。最终复核前
  运行时有 5 个 `FAILED` 和 60 个 `DEAD_LETTER` Job；最新失败是一个已有 RBNZ 采集 Job
  被当前 Worker 以 `RIGHTS_BLOCKED` 终止，其余需区分历史验收残留与真实待处理失败。
- Argus health/readiness 通过；数据库迁移
  `20260729093000_argus_execution_orchestration` 已应用，存在 33 个 `COMPLETED` 和 1 个
  `CANCELLED` 的 `ArgusExecution`，没有活动执行。
- 最终复核期间 Tymra Web/API/Worker 被重建；容器中的 Argus client、Worker service 和
  公开来源验收脚本哈希均与当前工作树一致。Web、Worker 和 Argus HTTPS health/readiness
  随后均返回 HTTP 200。运行健康仍不替代未执行的数据库集成与真实来源验收。

## 当前优先级

| 优先级 | 工作 | 完成条件 | 当前状态 |
| --- | --- | --- | --- |
| P0 | 收口当前实现 | 删除两个带 ` 2` 的 Argus 旧副本；审查最终 diff；只保留唯一异步 Job client/test | 已完成 |
| P0 | 完成当前工作树质量门槛 | 专用测试库上的 `pnpm verify` 通过；必要时再跑 `pnpm test:e2e` | `pnpm verify` 已通过：lint、类型、79 个根单元测试、42 个 Worker 单元测试、53 个数据库集成测试和生产构建均通过 |
| P0 | 核对本地运行栈与失败队列 | 当前工作树容器 health/readiness、迁移、队列与 Argus 恢复一致；历史失败已分类 | Argus-only 栈与重启恢复已验证；5 个 FAILED / 60 个 DEAD_LETTER 为本轮前既有队列状态，仍待运营分类 |
| P0 | 保持首页现有视觉与交互 | EN/ZH 桌面与移动端真实渲染、关键交互、可访问性和无横向溢出 | 历史已验证；本轮无 UI 实现改动，未重跑 E2E |
| P1 | 公开来源回归 | 在 Scheduler 关闭和专用开发数据边界下重跑 17 来源两轮验收 | 本轮已重跑 Argus 四来源有界真实验收；其余 13 个直接来源沿用 2026-07-30 验收 |
| P1 | Eventfinda 长期稳定性 | 目标环境全国持久抓取、多日无人值守、恢复、容量和告警证据 | 本地有界与全国 bootstrap 已有历史证据；长期验收待部署环境 |
| P1 | Ticketmaster 实页稳定性 | 挑战冷却后重复有界实页验收，列表优先且无绕过 | 列表优先实现和自动化已通过；详情实页仍受外部挑战条件限制 |
| P1 | 手工导入真实文件验收 | 真实运营导出文件完成两次持久化验收 | `not_verified`：缺少真实文件 |
| P1 | Release 1.5 剩余项 | Retention、匿名漏斗分析、挑战/配额/会话边界测试完成 | 见追踪表中的逐项状态 |
| P2 | 生产采集启用 | 完成来源、容量、监控、回滚、安全和生产运维验收 | 未启动；本地验收不等于生产批准 |

## 交付顺序

1. 先收口重复文件并审查未提交 diff，避免旧同步 Argus client 被误提交或以后被测试发现规则漏掉。
2. 使用专用测试数据库运行当前工作树的 `pnpm verify`；UI 有变化时额外运行 `pnpm test:e2e`。
3. 用当前工作树重建本地 Compose 应用，再核对 `/worker/health`、`/worker/readiness`、
   Argus health/readiness、迁移状态和队列失败分类。
4. 在 Scheduler 关闭、边界固定且不会覆盖用户数据库的条件下，重跑公开来源两轮真实验收。
5. 本地门槛通过后，再在目标环境分别完成 Eventfinda 长期运行和生产来源启用验收。
6. 只有实际证据完成后才更新 `traceability.md`；历史 evidence 文件不回写成实时状态。

## 已知边界

- OTA 费率来源目前只有 URL/fixture 与确定性研究适配器，没有可声明为生产可用的实采实现。
- Eventfinda 本地环境可验证实现、持久化、幂等、锁、租约和恢复逻辑，不能替代多日无人值守验收。
- Ticketmaster 公开页面可能进入验证挑战；实现必须停止、冷却并保留证据，不得绕过。
- 手工导入仍需要真实运营文件才能完成真实文件验收。
- 当前宿主机 `PATH` 没有 Node.js；本轮通过项目 Docker Node 24 镜像完成不写数据库的验证。
- 当前 revision 的隔离 Compose smoke 已完成镜像构建、迁移、seed、Web、Worker API、Worker、
  PostgreSQL、Redis 和 Mailpit 健康检查，并自动清理临时容器与卷。
- `evidence/` 中的 2026-07-21 与 2026-07-30 结果都是历史快照，不代表今天的外部来源持续可用。
