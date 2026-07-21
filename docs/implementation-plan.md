# Tymra 当前实施计划

Last updated: 2026-07-21

## 基线

产品范围由 [`product/`](./product/README.md) 下的本地文档控制；Google Docs 已迁移并删除。实现状态只在 [`traceability.md`](./traceability.md) 维护，历史运行结果保存在 `evidence/`。

代码采用单仓库、多个可运行应用和共享包：

```text
apps/
  web/                    Next.js 公共站点、客户流程、Admin 与 HTTP API
  worker/                 队列、Scheduler、Worker API 与采集编排
  browser-worker/         隔离的只读浏览器执行进程
packages/
  browser-runtime/        浏览器任务协议与证据处理
  browser-site-extractors/来源解析器
  config/ db/ domain/ providers/ queue/
scripts/                  本地运维与验证脚本
docs/                     产品、架构、采集、证据和决策
```

## 当前重点

| 优先级 | 工作 | 完成条件 | 当前状态 |
| --- | --- | --- | --- |
| P0 | 保持 Web、Worker、Browser Worker 构建与测试稳定 | `pnpm verify` 通过 | 已验证 |
| P0 | 保持首页现有视觉与交互 | EN/ZH 桌面及移动端真实渲染、关键交互和无横向溢出 | 已验证 |
| P0 | 数据采集本地验收一致化 | 每个已实现渠道遵循 `collection/acceptance.md`，证据可追溯 | 已建立标准；按渠道持续执行 |
| P1 | Eventfinda 长期稳定性 | 目标环境中的全国持久抓取、多日无人值守、恢复与告警证据 | 本地门槛已通过；长期验收待部署环境 |
| P1 | Ticketmaster 实页稳定性 | 挑战冷却后重复有边界实页详情验收，无绕过行为 | 待外部页面条件允许 |
| P1 | 手工导入真实文件验收 | 真实运营导出文件完成两次持久化验收 | `not_verified`：缺少真实文件 |
| P1 | Release 1.5 剩余项 | Retention、匿名漏斗分析、挑战/配额/会话边界测试完成 | 见追踪表 |
| P2 | 生产采集启用 | 独立完成来源、容量、监控、回滚与生产运维验收 | 未启动 |

## 交付顺序

1. 每次结构或依赖变更先运行 lint、typecheck、unit/integration 和 production build。
2. UI 变更追加 EN/ZH、桌面/移动端真实浏览器验收。
3. 新采集渠道先完成解析与数据库回归，再执行两次有边界真实本地采集。
4. 本地验收通过后，生产启用仍需在目标环境独立验证容量、长期稳定性、监控和恢复。
5. 只有实际证据完成后才更新 `traceability.md` 的状态；历史证据文件不回写成实时状态。

## 已知边界

- OTA 费率来源目前只有 URL/fixture 边界，没有可声明为生产可用的实采实现。
- Eventfinda 本地开发环境可以验证实现、持久化、幂等、锁、租约和失败恢复逻辑，不能替代全国多日无人值守验收。
- Ticketmaster 的公开页面可能进入验证挑战；实现必须停止、冷却并保留证据，不得绕过。
- 手工导入需要真实运营文件才能完成真实文件验收。
- `evidence/` 中的 2026-07-21 结果是历史快照，不代表当前外部来源持续可用。
