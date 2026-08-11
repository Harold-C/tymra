# Tymra Free 会员端到端验收报告（2026-08-11）

> 历史快照：本文记录当次 fixture 验收及当时的运行边界。文末 Argus 404 状态随后已由
> Argus 恢复工作修复；当前代码与运行状态以 `docs/traceability.md` 为准。

## 结论

Free 会员的密码登录、会员内新建检查、地址与 OTA 房源确认、额度占用、定价单位创建、正式报告、价格日历和权限边界已完成真实浏览器回归。验收中发现的会员流程断点已修复，最终开发环境流程通过。

本次报价来自明确标注的 deterministic development fixture，不是真实市场价格，不构成生产 OTA 抓取或生产可用性证明。

## 测试输入

- 会员：`member-test@tymra.test`
- Synix 开发环境随机房源：`2/44 Brockworth Place, Christchurch 8011, New Zealand`
- Synix 渠道：Airbnb
- 公开 listing identity：`713337408265816459`
- 公开 URL：`https://www.airbnb.co.nz/rooms/713337408265816459`
- 入住：`2026-08-17`
- 退房：`2026-08-18`
- 入住人数：2 位成人
- 币种：NZD
- Price Check：`cmsn5u37x0002pg0pt03cxw12`

Synix 抽样只读取房源地址和公开渠道标识。第一条随机样本只保存 OTA 后台管理 URL，因不能作为公开证据而被排除；最终样本满足可构造公开 Airbnb listing URL 的条件。

## 正式分析结果

开发 fixture 返回并发布了完整目标价格：

- 状态：`PUBLISHED`
- 目标公开价格：NZ$214.00
- 价格口径：`STAY_TOTAL`
- 费用完整性：`COMPLETE`
- 价格证据：单一目标来源已观察
- 竞品区间：NZ$239–NZ$283
- 置信度：`HIGH`
- 结论：目标价低于 fixture 竞品区间，建议复核当前房价

结果页、会员报告和价格日历均保留“开发演示数据，不是真实市场数据”提示。系统没有以 `PARTIAL` 或 `INSUFFICIENT_DATA` 代替已采集到的有效目标价格。

## Free 会员权益验证

| 能力 | 验收结果 |
|---|---|
| 邮箱 + 密码登录 | 通过；退出旧会话后重新登录成功 |
| 新建 Price Check | 通过；会员入口直接进入地址流程，不再要求重复输入邮箱或重复同意服务消息 |
| 首份正式报告 | 通过；计为 `INITIAL_REPORT` |
| 主动检查额度 | 首份报告后剩余 1 次；Free 的第三次检查拒绝由集成测试覆盖 |
| 定价单位 | 自动创建并激活 1/1；停用与重新启用均通过，最终恢复为启用 |
| 逐日价格范围 | 14 天，按 `Pacific/Auckland` 展示 `2026-08-11` 至 `2026-08-24` |
| 市场监测范围 | 30 天，按 `Pacific/Auckland` 展示至 `2026-09-09` |
| 报告历史 | 通过；新报告只在所属会员账户可见 |
| 价格日历 | 通过；`2026-08-17` 显示 NZ$214 fixture 观测，其余日期明确显示无公开 OTA 观测 |
| 提醒 | 正确拒绝，提示需要 HOST 或更高方案 |
| 组合管理 | 正确拒绝，提示需要 PRO 或更高方案 |
| 导出与集成 | 正确拒绝并显示会员与上线开关限制 |
| 方案与账单 | Free / ACTIVE、额度和未来范围显示正确；未开放付费方案不可操作 |
| 设置 | 语言、营销同意、密码安全、会话和数据请求页面可访问；现有偏好保存成功 |

## 修复内容

1. 已登录会员新建检查原先仍走匿名入口，要求再次输入邮箱并可能发送 Magic Link。会员后台的新建入口现改为地址检查；页面自动使用当前会员身份。
2. 直接创建的 Price Check 原先没有绑定 `customerUserId`，因此不会进入会员报告历史，也不会占用 Free 额度。现在创建时绑定当前会话，最终查询确认时以 Serializable 事务预留额度、创建定价单位并写入 `MembershipUsage`。
3. `PROVIDER_MODE=fixture` 下，地址后的 OTA listing 验证原先仍检查 live Argus 数据源，导致开发环境错误返回 `SOURCE_UNAVAILABLE`。现在 fixture 模式使用明确、可审计的 deterministic fixture listing validation；live 模式继续严格使用 Argus 并 fail closed。
4. fixture 目标报价原先固定关联种子房源，地址检查生成的新房源无法获得目标观测。现在目标 fixture listing 与已确认的 Property / Sellable Unit 绑定，八个种子竞品仍作为比较集合。
5. 已登录会员完成检查后原先仍提示等待邮件私密链接。现在直接显示“打开分析报告”，返回会员后台，并让“再次检查”回到会员地址流程。
6. E2E 重建 Compose 运行时时可能与尚未删除完毕的旧容器发生同名竞争。现在每轮仅停止并移除测试管理的 `web`、`worker`、`api` 服务后再重建，不影响 PostgreSQL、Redis 或数据卷。
7. `PUBLIC_COLLECTION_MODE=fixture` 下，Worker API readiness 原先仍强制探测可选的 live Argus。现在 fixture 模式明确返回 `mode=fixture / healthy=true / ready=true`，live 模式仍严格检查 Argus。
8. 会员报告首次读取遇到一次瞬时 `ERR_EMPTY_RESPONSE` 时，页面原先会永久显示访问错误。现在最多自动重试三次，连续失败后才展示错误；目标用例和完整 E2E 均已通过。

## 持久化核验

最终 Price Check 数据库状态：

```text
status=PUBLISHED
customerUserId=present
listingValidationStatus=VERIFIED
isDemo=true
membershipUsage=INITIAL_REPORT
pricingUnit.active=true
rateCollection.priority=300
```

## 自动化与运行验证

- Web lint：通过
- 全仓 TypeScript typecheck：通过
- Web/domain/provider 单元测试：199 通过，5 个外部 fixture 场景明确跳过
- Worker 单元测试：123 通过，0 失败
- 新增会员直接检查集成测试：通过
- 新增 fixture OTA listing validation 集成测试：通过
- 隔离 PostgreSQL + 独立 Redis DB 全量集成测试：90/90 通过
- Docker 开发镜像构建：通过
- E2E fixture Compose：Web、Worker API、Worker 均健康
- Playwright 桌面端：10/10 通过
- Playwright 移动端：9/9 通过；1 个仅桌面管理后台用例按设计跳过
- 真实浏览器：登录、完整检查、报告、日历、权限页、设置、定价单位停用/恢复均通过
- `git diff --check`：通过

隔离测试完成后，临时 PostgreSQL 数据库和独立 Redis DB 数据已删除。未执行 commit 或 push。

## 剩余边界

- 本次只证明开发环境会员业务链路和 fixture 数据语义正确。
- 没有调用真实 Argus OTA 抓取，因此没有证明该随机 Airbnb listing 当前可访问、价格真实或地址与公开页面长期一致。
- E2E teardown 已恢复默认 live 开发配置；当前 `api.argus.test` 的 `/health` 和 `/readiness` 返回 404，因此默认 live Worker API readiness 为 false。该外部 Argus 运行态不影响本次 fixture 验收，但真实抓取前必须恢复。
- 付费方案、Stripe 生产结算、生产网络、容量、监控和 SLA 不属于本次 Free 会员验收范围。
