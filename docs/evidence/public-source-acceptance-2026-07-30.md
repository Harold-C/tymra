# 全部非 OTA 公开来源本地验收

日期：2026-07-30
验收 ID：`public-sources-2026-07-29T19:20:41.302Z-291e7692`

## 结论

17 个已配置公开来源连续执行两轮真实、有边界、只读采集，共 34 个 Job。34 个 Job 和
CollectionRun 全部为 `SUCCEEDED`，第二轮每个来源新增的 source/link 行均为 0。
Scheduler 在执行前后均有 0 个启用计划，来源治理未变化，结束时没有遗留
`SUBMITTED`、`RUNNING` 或 `CANCEL_REQUESTED` 的验收 Argus 执行。

本次验收证明开发环境中的传输、解析、持久化、来源链路和两轮幂等可用；不代表生产来源
审批、全国完整性、生产容量或多日无人值守稳定性。

## 固定边界

- 环境：`development`，Scheduler 关闭。
- 时间范围：两轮共享同一个开始时间及其后 31 天，避免运行时间移动改变边界。
- 每个来源每轮 `limit=2`、`maxAttempts=1`。
- Eventfinda 和 Ticketmaster：最多 1 个发现页、2 个详情目标。
- 不登录、不提交表单、不处理或绕过 Challenge。
- 总时长：138,145 ms。

## 运行证据

| 来源 | 第一轮 Job | 第二轮 Job | Argus/轮 | 第二轮新增 source/link 行 |
| --- | --- | --- | ---: | ---: |
| `public_holidays_nz` | `cms6gzgy60000mt6adm484qjj` | `cms6gzi4u0001mt6aa8qbjyoj` | 0 | 0 |
| `school_holidays_nz` | `cms6gziy50002mt6au59jsxnf` | `cms6gzjqp0003mt6a1qx9ysto` | 0 | 0 |
| `geonet` | `cms6gzk580004mt6arwa236ns` | `cms6gzky40005mt6a5i6idew4` | 0 | 0 |
| `linz` | `cms6gzlqq0006mt6aml0bg5g7` | `cms6gzm5k0007mt6a3h8alrkq` | 0 | 0 |
| `mbie` | `cms6gzmyp0008mt6a56eqns3z` | `cms6gzo5r0009mt6awxuj0eug` | 0 | 0 |
| `stats_nz` | `cms6gzpcd000amt6aep9996yv` | `cms6gzq4t000bmt6a3bmxk12u` | 0 | 0 |
| `venue_calendars` | `cms6gzqjc000cmt6apo8fdkja` | `cms6gzs4q000dmt6aqapx1kx0` | 0 | 0 |
| `council_calendars` | `cms6gzsx8000emt6ablyz8nly` | `cms6gzyrg000fmt6au92p8hz7` | 1 | 0 |
| `university_calendars` | `cms6h0505000gmt6aqs8uiv4g` | `cms6h08x6000hmt6aa5vsn07r` | 0 | 0 |
| `rto_calendars` | `cms6h0bop000imt6ahrc5sb5x` | `cms6h0cv5000jmt6a0h5pw8i2` | 0 | 0 |
| `metservice` | `cms6h0e7t000kmt6akyczb40k` | `cms6h0emb000lmt6a6fjs6ilr` | 0 | 0 |
| `nzta` | `cms6h0ffi000mmt6avmy92i68` | `cms6h0g80000nmt6a5rjkami5` | 0 | 0 |
| `airport_data` | `cms6h0gn2000omt6ayxywg46i` | `cms6h0h1t000pmt6a9bnmernp` | 0 | 0 |
| `port_and_cruise` | `cms6h0hg9000qmt6a05ioa9vf` | `cms6h0i8w000rmt6a0ka2j28s` | 0 | 0 |
| `fx_rates` | `cms6h0inr000smt6a8v5vzmj0` | `cms6h0tk2000tmt6ahpptxajw` | 1 | 0 |
| `eventfinda` | `cms6h12id000umt6a6r77nnyb` | `cms6h19i9000vmt6ab6lokkyc` | 1 | 0 |
| `ticketmaster` | `cms6h1g4d000wmt6aqpw0vdyt` | `cms6h1z5x000xmt6airwo2mhy` | 1 | 0 |

OurAuckland 两轮各返回并持久化 2 个活动、关联 1 次 Argus 执行并保存 4 个 Tymra
Artifact；第二轮没有新增事件、occurrence 或链路。Ticketmaster 每轮发现 19 个列表活动，
接受并持久化 2 个，因已有稳定列表数据而避免 2 次不必要详情请求。RBNZ 每轮通过 Argus
持久化 2 个汇率信号。

完整机器可读报告保存在本次开发环境临时文件
`/private/tmp/tymra-public-acceptance-final-2026-07-30.json`，不提交含运行数据的 JSON。

## 回归门槛

- Argus 镜像构建：通过；构建内 53/53 测试通过。
- Tymra 全工作区 TypeScript：通过。
- Tymra Worker 生产构建：通过。
- Tymra Argus client/orchestrator、Eventfinda、Ticketmaster 定向测试：28/28 通过。
- 两个项目 `git diff --check`：通过。

完整工作区 `pnpm verify` 已启动，但停在现有 `apps/web` 的 `next lint`，该进程持续空闲且
没有输出，因此未进入后续全量测试、集成测试和 Web 生产构建。相关残留进程已终止；本页
不把未完成的完整门槛写成通过。
