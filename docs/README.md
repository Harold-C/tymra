# Tymra 文档入口

按任务读取下列权威文件。产品目标、当前实现、实际运行与历史验收分别判断；
普通文档阅读不启动采集、构建或发布。

| 要回答的问题 | 权威入口 |
| --- | --- |
| 产品目标、商业权益、合同优先级与公司/品牌边界 | [产品入口](product/README.md) |
| 当前实现、最近记录的环境/版本、验收及缺口 | [追踪表](traceability.md) |
| 接下来做什么、完成条件是什么 | [实施计划](implementation-plan.md) |
| 稳定取舍、被替代的方案与文档变迁 | [决策记录](decisions.md) |
| 启动、运行、测试及命令副作用 | [根 README](../README.md) |
| 目录、依赖和 Worker 流程 | [代码结构](architecture/codebase.md)、[Worker 架构](architecture/worker.md) |
| 某次历史验收究竟证明什么 | [证据索引](evidence/README.md) |

## 产品合同

- [需求](product/requirements.md)：范围、目标和完整产品验收。
- [全国数据核心](product/data-core.md)：身份、覆盖、时间、质量、历史及 lineage。
- [业务规则](product/business-rules.md)：领域状态、判断、接口与不变量。
- [客户漏斗](product/customer-funnel.md)：匿名价值、密码认证、邮箱验证与会话。
- [会员](product/membership-plans.md)：方案、价格、Property 额度及生命周期。
- [页面结构](product/page-structure.md)、[视觉交互](product/visual-interaction.md)：页面与体验合同。
- [核心策略](product/core-strategy.md)：住宿市场数据及价格分析方向。

## 数据采集

| 范围 | 文档 |
| --- | --- |
| 共同验收边界与历史评估工具 | [采集验收](collection/acceptance.md) |
| Tymra/Argus 职责、OTA、异步 Job、证据及 ACK | [Argus 合同](collection/argus.md) |
| 非 OTA 请求策略、去重、持久化及重试 | [公开数据](collection/public-data.md) |
| 全国市场、地址分层与来源质量门槛 | [全国公开信号覆盖](collection/nz-market-public-signal-coverage.md) |
| 事件事实与价格影响的区别 | [事件影响合同](collection/event-impact-data-contract.md) |
| 浏览器列表/详情与来源保护 | [Eventfinda](collection/eventfinda.md)、[Ticketmaster](collection/ticketmaster.md) |
| 直连事件、机场、港口及地区日历 | [直连来源](collection/direct-event-sources.md) |
| 人工数据导入 | [手工导入](collection/manual-import.md) |

## 维护约定

同一事实只维护一个当前入口；历史验收绑定日期、候选和环境，不作为实时健康保证。
已被替代的交接/准备文档可删除，在[变迁记录](decisions.md#文档与运行阶段变迁)保留结论和
Git 恢复位置，不建立旧链接适配页或重复状态文件。原始资料、数据库记录、运行证据和备份
与文档正文分开处理；文档清理不隐含对这些对象的删除授权。
