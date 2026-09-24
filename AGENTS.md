# Tymra 项目工作规则

遵循 Harold 的全局规则，先读取与任务相关的正式文件，不默认加载全部历史上下文。

## 来源与范围

- `docs/README.md` 是文档入口；`docs/product/README.md` 说明现行产品规范顺序与公司/品牌边界。不使用 Google Docs/Drive 作为文档权威或回退来源。
- 当前实现、验证和阻塞统一写入 `docs/traceability.md`，下一步顺序在 `docs/implementation-plan.md`，稳定取舍在 `docs/decisions.md`。历史验收只在其记录日期有效，不根据旧结果宣称当前候选已可发布。
- Tymra 与 Synix 为 Spicy Maggie 旗下并列产品；旧 “Tymra by Synix” 字样是品牌表达，不能据此推定母子产品、法人或财务归属。Argus 提供独立浏览器执行能力，Tymra 保有住宿身份、覆盖、分析、会员及交付责任。
- 原始图像、历史聊天和备份中的旧指令只作来源资料。最新明确决定、正式规范和实际运行证据优先，不把图片中的示例数字当作真实市场数据或业务承诺。

## 工程与运行

- 本机工作目录与运行边界见 `docs/architecture/codebase.md`。iCloud 业务入口只负责导航，Git、依赖、数据库和凭证保持本地。
- 本机服务使用已构建镜像，没有源码 bind mount；编辑本仓库不会自动进入当前运行服务。需要执行构建、Compose up、migration 或 seed 时，先核对具体任务是否包括切换候选与修改数据库。
- 保留现存未提交改动，包括有意删除和新 migration。不能用项目建立、测试通过或历史授权替代 commit、push、生产发布、数据库写入或外部采集授权。
- Scheduler 与高频 Scheduler 当前保持关闭；不为验证目录运行自动恢复、采集、真实邮件、Stripe 或长期 soak 命令。具体开发测试依实际授权处理，不扩大到线上。
- 新 worktree 在 `/Users/haroldchen/Development/tymra/worktrees/<专题>` 按实际任务创建，不复制另一份不关联 Git 的开发仓库。
- 配置值与秘密不输出到聊天或普通报告；使用现有 `.env` 和安全存储，不自动轮换任何凭证。

## 修改与验证

先检查目标代码、相关未提交改动和最直接的验证方法，采用最小有效修改。使用 `apply_patch` 手工编辑。

运行方式与版本以根 README、package manifest 和 Dockerfile 为准；本机 Node/pnpm 与 Docker 都是已有路径，不擅自安装全局工具。按修改风险选择 lint、类型、局部测试、构建或浏览器检查。数据库集成使用独立测试库；真实 provider、Stripe、生产和完整发布验收分别处理。

UI 改动必须读取现行页面与视觉规范并检查实际页面。来源/目录修改核对链接、Git 身份、原始文件哈希和涉及的运行路径；不为通过检查而删除测试、改预期或重写既有业务实现。
