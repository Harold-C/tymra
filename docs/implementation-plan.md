# Tymra 当前实施计划

Last updated: 2026-08-07

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
| P0 | 完成当前工作树质量门槛 | 专用测试库上的 `pnpm verify` 和完整 `pnpm test:e2e` 通过 | 当前代码已通过 lint、类型、149 个根测试（5 个外部 provider fixture 跳过）、86 个 Worker 测试、74 个隔离数据库/API/Worker 集成测试和生产构建；桌面/移动各 9 个 E2E 为此前已通过证据，本轮地址确认交互由 API 集成回归覆盖，完整 E2E 未重跑 |
| P0 | 核对本地运行栈与失败队列 | 当前工作树容器 health/readiness、迁移、队列与 Argus 恢复一致；历史失败已分类 | 已完成只读分类；未重放或删除历史/验收任务 |
| P0 | 保持首页现有视觉与交互 | EN/ZH 桌面与移动端真实渲染、关键交互、可访问性和无横向溢出 | 已完成完整桌面/移动 E2E、axe 与真实 Browser 检查；无 console error |
| P1 | 公开来源回归 | 在 Scheduler 关闭和专用开发数据边界下重跑全部来源两轮验收 | 34 个来源、68 pass 全部通过；第二轮均零增长，Argus execution 全部收口 |
| P1 | Eventfinda 长期稳定性 | 目标环境全国持久抓取、多日无人值守、恢复、容量和告警证据 | 已实现可恢复 checkpoint、容量统计和失败率告警；本轮 2 cycle/4 pass 实采通过，长期验收待部署环境 |
| P1 | Ticketmaster 实页稳定性 | 挑战冷却后重复有界实页验收，列表优先且无绕过 | 列表优先实现和自动化已通过；详情实页仍受外部挑战条件限制 |
| P1 | 手工导入真实文件验收 | 真实运营导出文件完成两次持久化验收 | `not_verified`：缺少真实文件 |
| P1 | Release 1.5 剩余项 | Retention、匿名漏斗分析、挑战/配额/会话边界测试完成 | 本地 deterministic challenge 与前端状态已验证；托管 provider 的服务端接口已完成，生产 vendor 配置、客户端组件与最终隐私批准仍是外部门槛 |
| P1 | Event impact v2 | 结构化证据、可信场馆 enrichment、跨来源证据聚合、唯一信号和真实样本 pending/promotion | Tymra 侧已完成；人数证据与独立“官方规模 + 住宿需求”组合均有门槛，容量/重复刊登不提升；隔离数据库验证唯一 canonical signal 与完整 lineage |
| P1 | 全国主要市场公开信号 | 15 个主要住宿市场具备全国发现、当地官方活动、住宿需求和扰动层 | Tymra 可直连的 14 个市场及 Dunedin Argus 路径已实现；ADP、TVF、MRTE、IVS、Stats NZ、DOC 关闭、Interislander 提醒、三大滑雪季窗口及主要航空流量已接入并通过有界实采/隔离落库 |
| P1 | 全国地址身份解析 | 任意 NZ 街道地址先解析为标准地域身份，再进入 `FULL / REGIONAL / NATIONAL_ONLY` 信号路由；歧义不得自动选择 | LINZ 查询、进程 L1 + PostgreSQL L2、按结果 TTL、版本失效和 Redis 防击穿已实现；查询仅保存 HMAC，规范地址与候选关系独立于 Property，用户确认后才晋升 Property；重启后真实数据库命中及 17 Region 语料已验证 |
| P2 | 生产采集启用 | 完成来源、容量、监控、回滚、安全和生产运维验收 | Admin 就绪页、可执行 canary、事务回滚、队列动作和跨源对账已完成；来源启用与运行健康门禁阻止不安全执行 |

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

- Tymra 已实现九个 OTA 品牌的 Argus listing 身份、地址驱动的有界竞品发现、目标与竞品费率采集、平台族标识、跨品牌去重、证据复制后 ACK 和安全降级；在新增 Argus Connector 完成真实有界验收前，仍不能声明生产可用。
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
- 全国主要市场当前实现口径与 2026-08-06 有界实采见
  [`collection/nz-market-public-signal-coverage.md`](./collection/nz-market-public-signal-coverage.md)。14 个直连市场加 Dunedin Argus 路径均已实现，但不等于已证明多日稳定。已解析的新西兰地址现按 `FULL / REGIONAL / NATIONAL_ONLY` 降级，不再写死 Christchurch 或拒绝非 15 市场地址。
- 全国地址身份第二阶段使用 LINZ 官方公开 ArcGIS Feature Service。标准结果包含规范地址、城市、
  Region、Territorial Authority、RTO、邮编（仅输入或来源明确提供时）、WGS84 坐标和可信度；
  多候选进入确认，低可信度不自动选择，显式 Region 冲突的候选会被排除。L2 缓存只保存 HMAC
  查询指纹、公开规范地址、有序候选、解析器版本和有效期，不保存原始查询、邮箱、会话或价格数据；
  UNIQUE / MULTIPLE / NONE 分别缓存 7 天 / 24 小时 / 1 小时。候选在确认前不会创建 Property 或 Unit。
