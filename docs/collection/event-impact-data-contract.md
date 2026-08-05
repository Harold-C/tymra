# 事件房价影响数据契约 v1

## 目的

Tymra 收集事件不是为了复刻票务网站，而是为了判断某个住宿市场、某些入住日期是否可能受到事件需求影响。
本契约定义 Tymra 在两个阶段需要的数据：

1. **事件事实入库和匹配**：确认是什么事件、何时发生、在哪里发生以及当前状态。
2. **提升为房价影响信号**：在事件事实之外，必须有可审计的规模或需求证据。

事件可以在第二阶段证据不足时正常入库，但必须保持 `PENDING_EVIDENCE`，不能自动产生
`MAJOR_EVENT` 信号。

这是一份 Tymra 业务目标契约，不是 Argus 的统一返回 Schema。Argus 的每个 Connector/workflow
返回自己的 `data_schema` 和 `schema_version`；Tymra 先按这两个字段严格选择来源 normalizer，
再把来源事实转换为本契约。来源没有公开的字段可以正常缺失，不用空的统一对象填充。

## 字段清单

### A. 事件事实：入库必需

| 字段 | 要求 | 说明 |
| --- | --- | --- |
| `sourceId` | 必需 | 来源标识，例如 `ticketmaster`、`eventfinda`、`council_calendars`。 |
| `externalId` | 必需但可由 Tymra 派生 | 首选来源事件 ID；来源无 ID 时，由规范化 `sourceUrl` 生成稳定 ID。 |
| `sourceUrl` | 必需 | 可回查的官方或公开详情页 URL。 |
| `title` | 必需 | 来源展示的事件名称。 |
| `sourceCategory` | 可空 | 来源原始分类；不得假装成已经标准化的类别。 |
| `startsAt` | 必需 | 单次 occurrence 的开始日期或时间。 |
| `endsAt` | 条件必需 | 来源有结束时间时必须保留；没有时需明确记录缺失或精度，不能伪造持续时间。 |
| `timePrecision` | 必需 | `DATE` 或 `DATETIME`，用于避免把全天日期误当精确时间。 |
| `timezone` | 必需 | IANA 时区；新西兰来源通常为 `Pacific/Auckland`，可由 Connector 固定规则补全。 |
| `status` | 必需 | `SCHEDULED`、`CANCELLED`、`POSTPONED`、`RESCHEDULED` 或 `UNKNOWN`。 |
| `venueName` | 条件必需 | 有固定场地时保留；线上或未公布地点可为空。 |
| `address` / `city` / `region` | 条件必需 | 与经纬度二选一，至少要有足以分配住宿市场的位置。 |
| `latitude` / `longitude` | 强烈建议 | 精确场地匹配和酒店距离计算所需；若缺失，由 Tymra 的受控地点匹配补全。 |
| `observedAt` | 必需 | 本次采集时间，来自 Argus Job 的 `page.captured_at` 或 Tymra 接收时间。 |
| `sourceUpdatedAt` | 可空 | 只有来源明确公布更新时间时才填写。 |
| `evidenceRef` | 必需 | 指向本次可验证采集证据的引用和哈希，不保存为业务展示字段。 |

`category`、`subcategory`、`territorialAuthority`、`countryCode` 和 occurrence 的稳定
`externalId` 是 Tymra 的标准化结果。Argus 应尽量提供原始事实，但不负责 Tymra 的分类体系。

### B. 房价影响证据：提升为信号前必需

每条拟提升的事件必须至少有一条结构化 `impactEvidence`。每条证据包含：

| 字段 | 要求 | 说明 |
| --- | --- | --- |
| `evidenceType` | 必需 | `EXPECTED_ATTENDANCE`、`ACTUAL_ATTENDANCE`、`VENUE_CAPACITY`、`OFFICIAL_SCALE_LABEL`、`CORROBORATING_DEMAND` 或后续版本新增值。 |
| `value` | 必需 | 数值或受控枚举，不能只存一段无法计算的描述。 |
| `unit` | 条件必需 | 数值证据的单位，例如 `people`。 |
| `sourceUrl` | 必需 | 证据出处。 |
| `observedAt` | 必需 | 证据采集时间。 |
| `sourcePublishedAt` | 可空 | 来源明确公布日期时填写。 |
| `confidence` | 必需 | `0..1`；表示证据质量，不表示最终房价影响强度。 |
| `notes` | 可空 | 对场地布局、人数口径或限制条件的简短说明。 |

以下事实可辅助判断，但不能单独证明酒店需求影响：

- `ticketStatus`（包括售罄）；
- performer、team、organizer；
- 活动描述、限制、图片；
- 门票价格。

场馆容量只是规模上限，不等于实际到场人数；Tymra 必须使用版本化规则将它与活动类型、场地匹配可信度及其他证据结合。门票价格与住宿需求没有稳定的直接关系，因此保持可选，不作为 v1 的阻塞字段。

### C. 只由 Tymra 计算

以下字段不能要求 Argus 给出：

- canonical event / venue identity；
- 标准化 `category`、市场和 territorial authority；
- 事件到目标酒店的距离；
- 受影响入住日期和跨日范围；
- 多来源去重与 corroboration；
- `impactStatus`、`impactScore`、`impactConfidence`；
- 最终 `MAJOR_EVENT` 市场信号和房价建议。

Argus 负责确定性采集可观察事实；Tymra 负责业务判断。

## Tymra 当前实现

- `PublicEvent`、`SourceEventOccurrence` 和 canonical `EventOccurrence` 已保存受控的
  `timePrecision`；source occurrence 另存 `observedAt` 与 `evidenceRef`，canonical occurrence
  metadata 保留同一 provenance。
- `event-impact-evidence-v1` 对 evidence type、数值单位、来源 URL、采集时间和置信度进行严格
  校验。旧的任意 JSON 不再被当作可提升证据，而是安全降级为 `PENDING_EVIDENCE`。
- `event-impact-promotion-v1` 只接受可信度至少 `0.7` 且预计或实际到场至少 50,000 人的证据；
  `VENUE_CAPACITY` 单独出现时始终保持 pending。
- 可信场馆参考表使用精确别名匹配补充 Te Pae 的官方名称、地址和 3,600 人容量，并保留官方
  来源和观察日期；容量只作 enrichment，不等同于预计到场。
- Canterbury A&P Show 官方页面公布的 70,000 annual visitors 被规范化为
  `EXPECTED_ATTENDANCE`。2026-08-05 两轮真实采集均成功，第二轮 source/link 行零增长，source
  与 canonical occurrence 均为 `PROMOTED`。

尚未拆分的是来源原始分类和 Tymra 标准分类；当前二者仍共用 `category`。这不影响 v1 promotion
安全边界，但仍是后续数据模型质量工作。

## Argus 当前覆盖评估

### 按能力评估

| 能力 | Ticketmaster | Eventfinda | OurAuckland | 结论 |
| --- | --- | --- | --- | --- |
| 稳定来源 ID、URL、标题 | 满足 | 满足；无来源 ID 时 Tymra 可由 URL 派生 | 满足 | 满足 |
| occurrence 开始时间 | 满足 | 满足，支持多个 occurrence | detail 支持精确时间；listing 为日期 | 满足 |
| 结束时间与时间精度 | 经常缺失；Tymra 当前会折叠到开始时间 | 可缺失，已有缺失标志 | detail/listing 均明确 precision | 部分满足 |
| 生命周期状态 | listing/detail 可取但可能缺失 | detail 可取 | 固定假设为 scheduled | 部分满足 |
| 场地和市场位置 | listing 可有地址和经纬度；detail 已保留来源场馆字段 | detail 通常最完整 | detail 有场馆、地址原文和地图 | 基本满足 |
| 来源分类 | 常是通用 Schema.org 类型，detail 契约未保留 | listing/detail 可取 | Tymra 固定为 Council event | 部分满足 |
| 采集时间和证据哈希 | 满足 | 满足 | 满足 | 满足 |
| 来源更新时间 | 未提供 | 未提供 | 未提供 | 不满足，但不是入库阻塞项 |
| ticket status / offer | 部分满足 | 部分满足 | 未提供 | 可选能力部分满足 |
| performer / organizer | performer；detail 无 organizer | 两者均可取 | 未提供 | 可选能力部分满足 |
| 场馆容量 | 未提供 | 未提供 | 未提供 | 不满足 |
| 预计或实际到场人数 | 未提供 | 未提供 | 未提供 | 不满足 |
| 其他结构化影响证据 | 未提供 | 未提供 | 未提供 | 不满足 |

### 验收结论

- **事件发现、入库和基础日期/市场匹配：基本满足，但不是所有来源都达到完整质量。**
  Eventfinda detail 最完整；Ticketmaster 依赖 listing/detail 可用性；OurAuckland 只适合作为日期精度、Auckland 市场级事件。
- **自动判断事件会影响房价：只对有合格结构化证据的来源满足。** Ticketmaster、Eventfinda 和
  OurAuckland 本身仍不提供可用的人数证据，因此其事件保持 `PENDING_EVIDENCE`；Canterbury
  A&P Show 的官方 70,000 annual visitors 证据通过 v1 policy 后可提升。
- **门票价格不是缺口的修复方向。** 当前更重要的缺口是事件规模、位置精度和可审计的需求证据。

## 后续扩展门槛

1. 新增 evidence type 或调整 50,000 人阈值必须发布新 policy version，并补充 pending/promotion
   回归样本，不能原地改变历史解释。
2. 扩展可信场馆表必须使用官方容量来源、精确别名和有效观察日期；不得用模糊名称匹配。
3. 新增来源人数证据必须保留出处、观察时间和 evidence reference，并完成两轮真实采集幂等验收。
4. Auckland 等新市场在取得合格样本前继续保持 `PENDING_EVIDENCE`，不得以票价或售罄状态替代
   规模证据。
