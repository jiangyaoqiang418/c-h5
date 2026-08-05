# 真实接口接入计划

> 本文用于统一油宝 C 端 H5 的接口对接方式。说明使用中文，接口路径、字段名、代码名和 `mock` 等技术标识保持原样。

## 当前执行边界（2026-08-03）

### 目标与阶段

- 当前唯一交付端为移动 H5、Android App、iOS App，采用 UniApp App-Vue；兼容基线为 Android 8+、iOS 13+。
- 当前后续功能以 H5 为先行开发和真实接口回归端，Android/iOS 兼容边界继续保留，但不阻塞 H5 的 P2 模块推进；H5 模块完成后再集中执行 App 回归。
- 本轮只实施 P0 三端工程与请求基础、P1 跨端 UI 整改、P2 首批真实接口。支付、KYC 相机/上传、IM/推送、签名、商店发布和热更新属于 P3/P4，明确不在本轮范围。
- H5、Android/iOS 统一使用 `pages.json` 的窗口级原生 tabBar；页面不得渲染底栏。五个一级页面只负责内容，并使用同一组入口和跳转规则。
- 默认顶部导航同样由 `pages.json` 的窗口级导航栏承载；首页业务搜索头、登录页无导航、商品详情浮层返回和钱包 Hero 导航是当前已登记的自定义导航例外。

### P2 前置门禁

1. 实时抓取 `admin`、`user`、`order` Swagger，递归比较旧矩阵与最新文档的路径、方法、参数、必填项、requestBody、response、schema 和嵌套字段。
2. 将差异及 A/B/C/D 结论更新到 `api-swagger-match-matrix.md`，再选择当前页面实际需要且契约完整的接口。
3. H5 首批接入须提供可访问的 HTTP 或 HTTPS 服务地址、可登录测试账号、分类/积分/钱包测试数据、成功码规则和错误响应样例；缺少任一项时不得将页面从 Mock 切到真实接口。Android/iOS 迁移另须提供 HTTPS 地址。
4. H5 开发环境使用 `/api/*` Vite 代理，H5 部署环境使用同源 `/api/*` 服务器反向代理；Android/iOS 直接访问 HTTPS 服务。不得为 iOS 配置 HTTP 例外，也不得在真实请求失败时回退 Mock。

### 已确认的最新 Swagger 状态

- Swagger 文档首页（用户提供，P2 实时审查入口）：`http://221.128.249.198:8902/doc.html#/home`。
- 2026-08-03：`admin` 为 84 路径/85 操作/138 schema，`user` 为 19/19/45，`order` 为 40/42/50；三个文档版本均为 `v1.0.0`。
- 首批候选仍为 `POST /user/auth/login`、`GET /user/auth/me`、`GET /order/categories/tree`、`GET /user/points/account`、`GET /user/wallet/overview`、`POST /user/withdraw/create`。
- 已从 c-pc 的真实环境配置复核通用口径：服务分组为 `https://testhou.merchantsale.store/api/{admin,user,order}`，成功码为 `1`，登录失效码为 `-200`、强提示失效码为 `-201`；错误信息字段兼容 `message`/`msg`。H5 仅复用这些契约和地址，不复用 PC 的浏览器请求实现。
- 2026-08-03 实测：真实服务对 `http://localhost:5173` 的带 `X-Access-Token` 跨域预检返回 HTTP 403。H5 开发必须使用 `/api/{user,order,admin}` Vite 代理；部署 H5 与 c-pc 一样使用同源 `/api/*` 服务器反向代理，Android/iOS 使用完整 HTTPS 服务地址。
- 当前 Swagger 服务仅确认 HTTP 可用，HTTPS 握手失败。按当前决策，P2 可先在 H5 使用 HTTP 服务开发；本轮读取候选已使用本地受保护的测试账号、可用测试数据、成功码和错误口径完成验证（凭据不写入仓库）。后续新模块仍须满足本节门禁；提现等写操作在未记录真实请求、响应和结果页证据前，不得标记为真实验证。Android/iOS 对接继续等待 HTTPS 地址。

### 2026-08-03 P2 首批 H5 实施证据

| 能力 | 契约与实现 | H5 真实验证 | 当前状态 |
|---|---|---|---|
| 邮箱登录、当前用户 | `POST /user/auth/login` → `GET /user/auth/me`，登录后再读取积分账户 | `/api/user/*` Vite 代理返回 HTTP 200、`code: 1` | 登录页与用户 Store 已迁移 |
| 积分账户 | `GET /user/points/account` | HTTP 200、`code: 1`，返回 `userId/points/customer/buyer` | API adapter 已接入登录后的用户状态；积分流水仍为 Mock |
| 分类树 | `GET /order/categories/tree?onlyEnabled=true` | HTTP 200、`code: 1`，测试数据 4 个根分类 | 分类页已迁移；商品列表仍为 Mock |
| 钱包总览 | `GET /user/wallet/overview` | HTTP 200、`code: 1`，返回 `total/currency/todayIn/todayOut/distribution` | 钱包 Store 与提现页余额已迁移；流水、充值仍为 Mock |
| 提现创建 | `POST /user/withdraw/create` | 未提交真实写入，避免消耗测试账户资产 | 类型、adapter、提交结果提示已完成；仅待人工点击后验证真实写入与结果 |

- H5 代理使用 `VITE_REAL_*_BASE_URL=/api/*`，目标服务地址仅存在于环境配置；请求层不在真实接口失败时回退 Mock。
- 原始服务 ID 在已迁移用户模型以 `remoteId: string` 保存；仅旧 Mock 页面使用兼容展示 ID，避免把真实 `int64` 作为 API 参数转为 `number`。

### 2026-08-04 积分流水与申诉前置复核

- 实时读取结果仍为 `admin` 84 路径/85 操作/138 schema、`user` 19/19/45、`order` 40/42/50，版本均为 `v1.0.0`，与 2026-08-03 快照一致。
- `POST /user/points/ledger/page` 的 requestBody 为 `PointLedgerPageQuery`，页面只需传 `pageNo/pageSize`；接口按当前登录用户强制过滤，不从旧 Mock 页面透传 `userId`。
- 流水响应包含 `id/userId/behaviorCode/behaviorName/score/balanceAfter/appealable/appealStatus/createdAt`，可在 API adapter 保留 Long ID 字符串并适配当前列表交互。
- `POST /user/points/appeals/submit` 必填 `ledgerId/reason`，`reason` 最长 500，返回申诉 Long ID；仅完成契约复核，真实写入仍须在存在可申诉扣分流水时单独验证。
- 积分规则仍只有 `admin` 分组读取能力，C 端访问契约未确认，本次继续保留原 Mock 规则展示，不扩大迁移范围。
- 已新增真实积分流水 adapter，并将“我的积分”流水列表切换到 `POST /user/points/ledger/page`；2026-08-04 Chrome 登录测试账号后页面正常返回空记录并显示原有空态，未出现请求或脚本错误。
- 申诉弹窗已改为调用 `POST /user/points/appeals/submit`，但测试账号当前无可申诉扣分流水，因此未触发真实写入；积分规则标签仍读取 Mock，并已确认原展示行为不变。

### 2026-08-04 H5 账户数据收口

- 本轮继续以 H5 为先行开发和回归端，代码保持 UniApp 跨端兼容；App 回归不阻塞本轮账户模块推进。
- “我的”页总资产已从 `@shared` Mock 切换为钱包 Store 的真实 `GET /user/wallet/overview`，订单状态计数继续保持原 Mock，页面布局和加载顺序不变。
- “我的”页 VIP 升级进度与 VIP 特权页当前等级、积分、下一阈值统一读取 `GET /user/points/account`；VIP 全等级权益配置仍使用 Mock，因为 `admin` VIP 配置接口不是已确认的 C 端公开契约。
- 本机回归账号保存在 Git 忽略文件 `.h5-test-account.local`，文档只记录读取方式，密码不得提交到远端历史。
- Chrome H5 回归已验证登录、“我的”和“VIP 特权”页面；真实返回与页面一致：积分 `0`、顾客等级 `VIP0`、下一阈值 `1000`、钱包总额 `0`。未触发提现或积分申诉真实写入。

### 2026-08-04 H5 钱包流水与求购闭环

- 最新 Swagger 计数仍为 `admin` 84 路径/85 操作/138 schema、`user` 19/19/45、`order` 40/42/50，`notify` 仍返回 HTTP 404；本轮关键钱包和求购契约与既有矩阵一致。
- 钱包首页“最近交易”和资金流水页已从 `@shared` Mock 切换到 `POST /user/wallet/ledger/page`。adapter 将 `bizType/bizGroup/fromType/toType` 映射到现有流水类型和资产桶，Long ID 只做类型兼容，不做数值转换。
- Chrome 真实账号回归中钱包流水返回 `code: 1、total: 0`；钱包首页显示“暂无交易”，资金流水页显示“暂无流水”，均无请求或脚本错误。非空流水、链上 hash、地址和费用拆分仍需具备对应数据后验证。
- 已新增求购真实 adapter，并迁移发起求购、我的求购、大厅、详情、撤销和抢单入口：`POST /order/demands/create`、`POST /order/demands/my/page`、`POST /order/demands/hall/page`、`GET /order/demands/detail`、`POST /order/demands/cancel`、`POST /order/demands/grab`。
- 后端状态已在 adapter 映射为当前页面状态：`OPEN -> pushing`、`TAKEN -> claimed`、`CANCELED/VOID -> cancelled`；路由和写操作保留真实 Long ID 原值。求购分类路径由真实分类树递归派生，历史数据引用已删除分类时明确显示“分类已失效”，不伪造分类名称。
- Chrome 使用回归账号创建测试求购 `2084594988764192770`，详情正确回显标题、分类、预算 `U 500.00`、说明和“推送中”；随后调用撤销接口，详情与“我的求购”列表均回显“已取消”。测试记录未留在可接单状态。
- 普通顾客调用求购大厅返回“请先申请成为买手”，页面显示空态且无未捕获错误，不回退 Mock。抢单接口和页面入口已接入，但当前账号角色为 `CUSTOMER`、KYC 为 `UNSUBMITTED`，仍需买手账号完成真实写入验证。
- Swagger 未返回推送批次、推送日志、客户/买手名称和取消原因；真实详情不展示这些无契约数据，等待后端补充，不使用 Mock 拼接。

### 2026-08-04 买手申请状态与页面初始化前置复核

- 实时读取仍为 `admin` 84 路径/85 操作/138 schema、`user` 19/19/45、`order` 40/42/50，`notify` 为 HTTP 404，与当天上一轮快照一致。
- `GET /user/buyer/application` 返回当前用户最新一条申请或空值；申请字段包含 Long `id/userId/reviewerId`，状态仅为 `PENDING/APPROVED/REJECTED`。
- 本轮只把真实申请状态用于现有顾客/买手切换提示，不新增申请入口或审核流程；接口失败时不使用 Mock 状态替代。
- “我的”、VIP、积分和提现页已使用部分真实账户接口，但页面加载不能依赖全局异步初始化先于页面生命周期完成；本轮将复用 `userStore.init()` 后再发起页面现有请求，不改变布局与操作顺序。
- 已新增买手申请真实 API，并在用户 Store 初始化和登录后读取；身份切换提示可区分审核中、未通过、已通过待 KYC、身份尚未生效和接口加载失败。当前真实账号回读状态为 `PENDING`。
- 用户 Store 已合并并发初始化；“我的”、VIP、积分和提现页已改为等待初始化后再加载，已迁移的分类、钱包、积分和求购页面补充了请求失败提示，不改变成功路径交互。
- Chrome 直接刷新回归通过：“我的”回显 `U 0.00/0 积分/距升级 1000`，VIP 回显 `0 积分/距下一级 1000`，积分流水为空态，提现可用余额为 `U 0.00`；控制台无 `error/warn`。Chrome 点击输入本轮未被浏览器接收，因此买手状态 Toast 仍待人工点击补证据。

## 2026-07-28 完整接口满足度扫描

### 扫描范围

- 已读取 `src/pages/` 下 41 个页面、`src/components/` 下 33 个组件、4 个 Store。
- 已读取页面实际调用的 16 个 `src/mock/api/*.ts` 模块、相关 `src/mock/typings/api/*.d.ts` 和直接读取的 Mock 数据。
- H5 当前实际调用 65 项 Mock API 能力；静态消息中心和本地购物车作为额外交互单独核对，不计入 65 项函数统计。
- 本次不是根据 Mock 文件名匹配，而是按页面表单、筛选、分页、详情字段、状态操作和写操作逐项核对。

### Swagger 历史快照（2026-07-28）

| 分组 | 文档地址 | 路径数 | 操作数 | 结论 |
|---|---|---:|---:|---|
| `admin` | `/admin/v3/api-docs` | 83 | 84 | 可读取 |
| `user` | `/user/v3/api-docs` | 19 | 19 | 可读取 |
| `order` | `/order/v3/api-docs` | 40 | 42 | 可读取 |
| `notify` | `/notify/v3/api-docs` | - | - | HTTP 404 |

三个有效文档版本均为 `v1.0.0`。详细路径和字段匹配见 `api-swagger-match-matrix.md`。

### 满足度结论

| 等级 | 数量 | 占 65 项 | 判定 |
|---|---:|---:|---|
| A 直接满足 | 4 | 6% | 路径、核心操作和主要数据可直接接入，仅需通用响应解包 |
| B 适配满足 | 13 | 20% | 通过字段映射、组合调用或本地派生可保持现有交互 |
| C 部分满足 | 19 | 29% | 有相关接口，但缺少现有页面需要的字段、状态或操作 |
| D 当前缺失 | 29 | 45% | 当前三组 Swagger 无匹配接口 |

- A+B 为 17/65，严格可接入满足度约 `26%`。
- A+B+C 为 36/65，计入部分能力后的覆盖度约 `55%`。
- 以上是 2026-07-28 的接口契约历史基线；当时 H5 全部使用 Mock。当前真实迁移状态以本文 2026-08-03、2026-08-04 实施证据为准。

### 建议推进顺序

1. 先接登录/当前用户、积分账户、钱包总览、提现、分类树等 A/B 能力，建立 H5 请求层和 token 闭环。
2. 再接买手商品、求购创建/取消/抢单等已有核心接口的模块。
3. 商品列表、订单、充值、钱包流水等 C 类模块先确认字段与交互缺口，再实施页面适配。
4. 地址、KYC、理财、评价、IM/通知、CMS、AI 和完整售后等待后端补齐，不用 Mock fallback 掩盖缺口。

## 当前基线（2026-07-28）

| 项目 | 当前状态 |
|---|---|
| Swagger | 与后台系统共用 `http://221.128.249.198:8902/doc.html` |
| 页面数据入口 | 页面/Store 调用 `@shared` |
| `@shared` 实际指向 | 本项目 `src/mock/` |
| Mock 机制 | 直接调用 TypeScript 异步函数，读取/修改内存数据，通过 `setTimeout` 模拟延迟 |
| Axios / fetch / uni.request | 当前业务源码均未使用 |
| 真实请求封装 | 尚未建立 |
| API 代理与环境变量 | 尚未建立 |
| PC/H5 Mock 关系 | 两边 101 个文件当前完全一致，但为各自项目内的独立副本 |

当前调用链：

```text
page / store
  -> @shared
  -> src/mock/api/<module>.ts
  -> src/mock/mock/data/* + Promise delay
```

该链路没有 HTTP 请求，不能直接复用后台项目仅作用于 Axios 实例的 browser Mock adapter。

## 对齐边界

- 交互以前端现有页面为准，不因 Swagger 调整页面流程或增加未经确认的能力。
- 接口 URL、方法、参数、字段、类型、枚举、分页和响应结构以后端 Swagger/实际返回为准。
- 字段差异优先在 `src/service/api/` 或 adapter 边界转换，尽量不改页面。
- 未迁移模块继续使用现有 `@shared` Mock，不批量统一函数名、入参、返回结构或 ID 类型。
- 已迁移模块显式调用真实 API，不做失败后自动 fallback Mock。
- 后台项目提供治理流程参考；H5 不直接依赖后台源码。

## 目标请求结构

正式接入首个模块时按需建立：

```text
src/service/
├── request/
│   ├── index.ts           # 请求实例与统一拦截处理
│   └── type.ts
└── api/
    └── <module>.ts        # 模块接口函数与响应适配

src/typings/api/
└── <module>.d.ts          # 真实接口类型
```

目标调用链：

```text
page / store
  -> src/service/api/<module>.ts
  -> src/service/request/
  -> Swagger 对应真实服务
```

请求层职责与后台项目保持一致：

- 集中维护 baseURL 和真实服务实例。
- 登录后使用 `X-Access-Token`；具体登录接口和无需 token 的白名单按 Swagger 确认。
- 按真实服务成功码判断业务成功，统一响应解包和错误提示。
- 统一处理登录失效，不在页面重复写 token 和业务码逻辑。
- 仅创建页面实际使用的请求实例，不提前封装未使用服务。
- H5 底层 transport 必须兼容目标 UniApp 运行端；是否使用 `uni.request`、Axios 兼容适配器或其他方案，在首个真实模块实施前确认。

## 固定对接流程

1. 阅读页面、组件、Store 和当前 Mock API，列出现有列表、详情、保存、状态变更、分页及错误交互。
2. 在共用 Swagger 中按业务语义匹配接口，不把 Mock 函数名或数据字段当作后端契约。
3. 标记状态：Swagger 接口存在、API 已封装、页面已调用、真实接口已验证。
4. 确定最小改法：只改 API/类型，或因字段缺失轻改页面；交互冲突先等待确认。
5. 只迁移本次模块；其他页面继续使用 `@shared` Mock。
6. 用户要求验证时，再检查请求、响应、分页、回显、写操作、错误提示和 token 失效。
7. 更新本计划和 `api-swagger-match-matrix.md`，记录已完成项、缺口和待确认问题。

## 状态口径

| 状态 | 判定标准 |
|---|---|
| Swagger 接口存在 | 最新 Swagger 中存在可匹配路径、方法和 schema |
| API 已封装 | `src/service/api` 已使用真实请求并完成必要转换 |
| 页面已调用 | 页面或 Store 已导入并实际调用该 API |
| 真实接口已验证 | 已按任务要求检查请求、响应、回显和错误行为 |

只有“API 已封装 + 页面已调用”才能描述为“页面已对接”；未经运行验证不得描述为“真实接口已验证”。

## 建议模块顺序

| 梯队 | 模块 | 目标 |
|---|---|---|
| 第一梯队 | 登录/当前用户、商品/分类 | 建立 token、基础读取、分页和详情闭环 |
| 第二梯队 | 地址、购物车结算、订单、支付相关 | 打通 C 端核心交易链路 |
| 第三梯队 | 钱包、资金流水、充值/提现 | 处理金额精度、状态和写操作 |
| 第四梯队 | KYC、VIP、积分、理财 | 对齐枚举、规则、审核和收益数据 |
| 第五梯队 | 售后、求购、评价、IM、CMS、买手、AI | 按页面入口逐模块迁移 |

实际顺序以用户明确任务和后端可用接口为准。

## 已知风险与待确认

- 当前大量 Mock ID 使用 `number`；真实 Java Long ID 可能超出安全整数范围，正式对接时需逐模块治理。
- 当前页面直接引用部分 `@shared/mock/data/*` 数据。涉及模块正式对接时需识别并移除运行时直读，不能只替换 API 函数。
- H5 同时保留 H5 与微信小程序构建命令；真实请求 transport、代理和跨域方案取决于目标运行端。
- 当前 Mock 为独立内存副本，刷新/重启会恢复种子数据；不应把写入结果当作后端持久化行为。
- PC/H5 的 Mock 副本目前一致，但没有自动同步机制；本轮不做跨项目共享重构。
- `admin` 中存在 VIP 配置和积分规则读取接口，但当前 Swagger 未声明鉴权方案，也不是 C 端服务分组；在后端确认可供 C 端访问前，仅按“部分满足”记录。
- `order` 的订单状态为 7 类，当前前端为 10 类；订单写操作与详情字段不完整，不能只做枚举映射后宣布对接完成。

## 开发检查

- 默认不运行 `pnpm dev:h5`、`pnpm typecheck` 或 `pnpm build:h5`。
- 用户明确要求验证时，优先使用已运行应用的终端和控制台；未启动时再使用项目现有命令。
- 不处理与当前接口模块无关的历史错误或警告。
