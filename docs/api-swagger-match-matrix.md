# Swagger 真实接口匹配矩阵

> 本矩阵按油宝 C 端 H5 的真实页面交互、字段和操作核对，不以 Mock 函数名相似作为接口满足依据。

## 扫描范围与 Swagger 快照

- 前端当前为 47 个页面、32 个组件、4 个 Store；历史 65 项 Mock API 能力统计口径保持不变。
- 当前实际调用：65 项 Mock API 能力。
- 共用入口：`http://221.128.249.198:8902/doc.html`。
- 2026-07-28 实时读取：`admin` 83 路径/84 操作，`user` 19/19，`order` 40/42。
- `notify` 的 `/notify/v3/api-docs` 返回 HTTP 404。
- 表中 `/user/...`、`/order/...`、`/admin/...` 用首段标识 Swagger 分组；分组内原始 path 分别从 `/auth/...`、`/orders/...` 等开始，后续同源请求前缀按请求层配置确定。

## 2026-08-03 实时复核与迁移门禁

| 分组 | 2026-07-28 | 2026-08-03 | 结论 |
|---|---:|---:|---|
| `admin` | 83 路径 / 84 操作 | 84 路径 / 85 操作 / 138 schema | 已变更，迁移前必须递归比较新增/修改契约 |
| `user` | 19 路径 / 19 操作 | 19 路径 / 19 操作 / 45 schema | 路径和操作数未变，仍需比较字段 |
| `order` | 40 路径 / 42 操作 | 40 路径 / 42 操作 / 50 schema | 路径和操作数未变，仍需比较字段 |

- 已重新确认首批候选的路径和必填字段：登录需要 `email/password`；分类树支持 `keyword/onlyEnabled`；提现需要 `chain/toAddress/amount`；登录、当前用户、积分账户和钱包总览均使用标准 `code/message/data/success` 响应包装。
- 当前服务仅有 HTTP，HTTPS 未可用；按当前决策可先用于 H5 开发。本轮读取候选已使用本地受保护的测试账号、可用测试数据、成功码与错误口径完成真实读取验证（凭据不写入仓库）。后续候选若未获得可访问服务、测试账号、测试数据、成功码与错误样例，仍不得标为 API 已封装、页面已调用或真实接口已验证；Android/iOS 对接仍需 HTTPS 地址。

## 2026-08-03 P2 首批 H5 接入状态

| 前端能力 | 最新 Swagger 契约 | API/页面状态 | 真实验证证据 | 未完成范围 |
|---|---|---|---|---|
| 邮箱登录、当前用户 | `POST /user/auth/login`，`GET /user/auth/me`；登录请求 `email/password` 必填 | `src/service/api/auth.ts`、登录页、用户 Store 已调用 | H5 Vite 代理 HTTP 200、`code: 1`，登录响应含 token；当前用户字段与 Swagger 一致 | 注册、资料更新仍未迁移 |
| 积分账户 | `GET /user/points/account` | `src/service/api/point.ts` 已由登录 adapter 调用 | HTTP 200、`code: 1`；返回 `userId/points/customer/buyer` | 积分流水、规则、申诉保持 Mock |
| 分类树 | `GET /order/categories/tree`；`keyword` 可选、`onlyEnabled` 默认 true | `src/service/api/category.ts`、分类页已调用 | HTTP 200、`code: 1`；分类响应含递归 `children` | 首页和业务表单的分类入口、商品列表保持 Mock |
| 钱包总览 | `GET /user/wallet/overview` | `src/service/api/wallet.ts`、钱包 Store、提现页余额已调用 | HTTP 200、`code: 1`；字段为 `total/currency/todayIn/todayOut/distribution` | 流水、充值、买手押金保持 Mock |
| 提现创建 | `POST /user/withdraw/create`；`chain/toAddress/amount` 均必填，`amount` 为 number | adapter 与提现页提交/结果提示已替换 | 未发起真实写入，避免影响测试账户资金 | 待人工提交后记录请求、响应和结果页证据 |

- H5 直连该服务的跨域预检返回 HTTP 403；上述读取验证经本地 `/api/*` Vite 代理完成。部署 H5 与 c-pc 一样使用同源 `/api/*` 服务器反向代理，Android/iOS 使用完整 HTTPS 服务地址。
- 状态严格区分：前四项为真实读取已验证；提现仅为 API 已封装和页面已调用，不能标记真实接口已验证。

## 2026-08-04 积分流水与申诉前置复核

| 前端能力 | 最新 Swagger 契约 | 适配结论 | 当前状态 |
|---|---|---|---|
| 积分流水 | `POST /user/points/ledger/page`，body 为 `pageNo/pageSize/userId/behaviorCode`；返回 `PageResult<PointLedgerDTO>` | 后端按当前登录用户强制过滤，页面不传 `userId`；Long ID 保留字符串，时间戳在 adapter 转为页面展示时间 | API/页面已迁移；Chrome 真实账号读取为空记录，空态正常且无请求错误 |
| 扣分申诉 | `POST /user/points/appeals/submit`，`ledgerId/reason` 必填，`reason` 最长 500；返回申诉 Long ID | 当前弹窗和提交顺序保持不变，仅替换真实 API；没有可申诉流水时不执行写入验证 | API/页面已迁移；测试账号无可申诉记录，真实写入未验证 |
| 积分规则 | 当前只有 `GET /admin/point-rules/list` | 未确认 C 端访问权限，继续保留 Mock，不因同页迁移而调用 admin 接口 | 本次不迁移 |

- 2026-08-04 实时计数仍为 `admin` 84/85/138、`user` 19/19/45、`order` 40/42/50，未发现相对 2026-08-03 的路径、操作或 schema 数量变化。

## 2026-08-04 H5 账户数据收口

| 前端能力 | 真实接口 | 当前状态 | 保留范围 |
|---|---|---|---|
| “我的”页总资产 | `GET /user/wallet/overview` | 已改为复用真实钱包 Store；Chrome 回显 `U 0.00` 与真实账户总额一致 | 订单状态计数继续使用 Mock |
| “我的”页 VIP 升级进度 | `GET /user/points/account` | 已读取顾客/买手当前角色的 `points/level/nextThreshold` | 无真实下一阈值时不显示“距升级” |
| VIP 特权页当前状态 | `GET /user/points/account` | 已迁移；Chrome 回显 `VIP0`、`0` 积分、距下一级 `1000` | 全等级权益配置继续使用 Mock，未调用 admin VIP 配置 |

- 本机 H5 回归账号只保存在 Git 忽略文件 `.h5-test-account.local`，凭据不进入仓库和远端历史。
- 本轮只执行真实读取和页面回显验证，未执行提现创建或积分申诉写入。

## 2026-08-04 H5 钱包流水与求购闭环

| 前端能力 | 最新 Swagger 契约 | API/页面状态 | 真实验证证据 | 保留缺口 |
|---|---|---|---|---|
| 钱包最近交易/资金流水 | `POST /user/wallet/ledger/page`，body 为 `pageNo/pageSize/bizGroup/bizType` | `src/service/api/wallet.ts`、钱包首页、资金流水页已调用 | Chrome 返回 `code: 1、total: 0`，两个空态正常且无错误 | 缺链上 hash、地址、引用和费用拆分；非空记录待验证 |
| 发起求购 | `POST /order/demands/create` | 真实 adapter 与发起页已调用 | 创建测试求购 `2084594988764192770` 成功，并由详情接口回读 | 图片上传尚未进入当前 H5 表单流程 |
| 我的求购/详情 | `POST /order/demands/my/page`、`GET /order/demands/detail?id=` | 我的列表、详情和 Long ID 路由已迁移 | 真实 `OPEN/CANCELED` 记录与新建记录均正确回显；分类路径来自真实分类树 | 缺推送批次/日志、客户/买手名称和取消原因 |
| 撤销求购 | `POST /order/demands/cancel`，body 为 Long `id` | 列表与详情撤销入口已调用 | 新建测试求购由 `OPEN` 变为 `CANCELED`，列表和详情同步为“已取消” | 后端不接收前端原有撤销原因 |
| 求购大厅/抢单 | `POST /order/demands/hall/page`、`POST /order/demands/grab` | 大厅读取与抢单入口已迁移 | 普通顾客收到“请先申请成为买手”，页面空态且无未捕获错误 | 抢单需已通过 KYC 的买手账号验证 |

- 求购状态映射为 `OPEN -> pushing`、`TAKEN -> claimed`、`CANCELED/VOID -> cancelled`；所有新接入 Long ID 在运行时保留原始字符串，不在页面层使用 `Number()`/`parseInt()`。
- 历史求购引用的分类若已不在最新分类树中，页面明确显示“分类已失效 · 原 ID”；不从 Mock 补名称，也不把真实请求失败回退 Mock。

## 2026-08-04 买手申请状态与页面初始化前置复核

| 前端能力 | 最新 Swagger 契约 | 适配结论 | 实施前状态 |
|---|---|---|---|
| 当前买手申请状态 | `GET /user/buyer/application`；响应可为空，非空时包含 `id/userId/realName/contact/reason/status/reviewRemark/reviewerId/appliedAt/reviewedAt` | `status` 仅为 `PENDING/APPROVED/REJECTED`；Long ID 保留原值。可用于修正现有身份切换提示，不新增申请流程 | API、用户 Store 和身份切换组件已接入；真实账号返回 `PENDING` |
| 已接入账户页面初始化 | 复用现有 `GET /user/auth/me`、`GET /user/points/account`、`GET /user/wallet/overview` | H5 直接刷新时页面生命周期不能假定全局异步初始化已经结束；页面应先复用 `userStore.init()`，再发起既有请求 | “我的”、VIP、积分和提现页已修复，并补充已迁移页面读取/写操作的错误提示 |

- 2026-08-04 实时计数仍为 `admin` 84 路径/85 操作/138 schema、`user` 19/19/45、`order` 40/42/50，`notify` 为 HTTP 404；相对当天上一轮快照无变化。
- 买手申请接口只用于读取并展示当前状态；本次不新增买手申请表单，也不把接口失败回退为 Mock 状态。
- Chrome 直接刷新“我的”、VIP、积分和提现页后分别回显真实余额 `U 0.00`、积分 `0`、下一等级阈值 `1000`、积分流水空态和提现可用余额 `U 0.00`；所访问页面控制台无 `error/warn`。
- Chrome 当前可完成页面导航和读取，但自动化点击输入未被浏览器接收，因此“买手申请审核中”Toast 尚缺浏览器点击证据；真实接口已单独回读为 `PENDING`，不得把该提示标为已完成交互验证。

## 2026-08-05 深度复核与 P2 下一批

- 重新读取 `swagger-config` 及全部有效分组：`admin` 84 路径/85 操作/138 schema、`user` 19/19/45、`order` 40/42/50，版本均为 `v1.0.0`；`notify` 仍为 HTTP 404。路径数量与 2026-08-04 一致，本次发现属于旧矩阵能力清单遗漏，不是后端新增路径。
- 对任务 2-7 当前代码使用的买手申请、积分申诉、商品、上传、充值和提现接口执行路径/HTTP 方法自动核对，共 `21/21` 与 live Swagger 匹配；商品上下架方法为 `PUT`。
- `POST /user/buyer/apply` 的 `BuyerApplyQO` 必填 `realName/contact/reason`，其中 `reason` 长度为 10-500；返回申请单 Long ID。已增加真实 API、买手申请页面、状态刷新和“我的”/身份切换入口，写入尚未使用真实账号验证。
- 65 项既有 Mock 能力的 A/B/C/D 比例暂不调整：下表多数接口对应当前 H5 新入口，或仍因字段不足保持 C；不能把 Swagger 存在直接计入已接入满足率。
- 2026-08-05 H5 公开回归：首页真实分类返回 4 个根分类；真实商品聚合当前为空，积分申诉页签空态正常；受保护的新页面均能触发登录拦截。因本机无测试账号，认证后非空数据和写入仍未验证。
- 2026-08-05 用户完成 H5 登录后补充验证：账号 `john` 的买手申请为 `PENDING`，买手商品、充值记录、提现记录和积分流水均为真实空记录；首页分类仍为 4 个根节点。当前账号 KYC 未提交且买手身份未生效，商品/买手写入、非空资金记录、积分申诉和充提现写入仍未验证。
- 2026-08-05 后续审核回归：同一申请已变为 `APPROVED`，H5 正确显示审核意见 `ok`；申请刷新逻辑会在通过后重新读取 `auth/me`，同步可能变化的买手角色。账号 KYC 仍未提交，买手商品真实列表继续为空，商品写入未验证。
- 2026-08-05 买手商品列表已补齐基于 `pageNo/pageSize/total` 的触底分页，状态页签切换和页面返回会重置第一页；当前真实账号列表为空，因此非空多页拼接仍待有数据账号验证。
- 2026-08-05 积分流水和积分申诉记录已分别补齐触底分页；Chrome 已登录账号验证两个列表空态及积分三页签往返正常、无新增控制台错误，非空多页拼接待有数据账号验证。

| 深扫补充能力 | Swagger 接口 | 契约结论 | 当前前端状态 |
|---|---|---|---|
| 注册、资料修改 | `POST /user/auth/register`、`PUT /user/auth/profile` | 核心字段完整 | 无对应页面，未封装 |
| 充值/提现记录与详情 | `/user/recharge/page`、`/user/recharge/detail`、`/user/withdraw/page`、`/user/withdraw/detail` | 记录和详情字段完整 | API、页面、路由和钱包入口已接入；真实非空记录未验证 |
| 积分申诉记录 | `POST /user/points/appeals/page` | 可展示审核状态与意见 | API 和积分页签已接入；真实非空记录未验证 |
| 买手申请提交 | `POST /user/buyer/apply` | A；`reason` 10-500 字 | API 和页面已接入，真实写入未验证 |
| 收藏、浏览打点 | `/order/products/favorite`、`favorites/page`、`products/view`、`storefront/browse` | 独立能力完整 | 首页真实详情已接浏览打点；收藏仍未接入 |
| 商品上下架、类目申请、秒杀报名 | `/order/products/shelf`、`categories/apply/*`、`flash-sale/*` | 卖家操作契约基本完整 | 商品上下架已接入；类目申请和秒杀报名仍无入口 |
| 卖家改价、发货 | `PUT /order/orders/price`、`POST /order/orders/ship` | 改价可接；发货仅传订单 ID | 未接入；发货缺承运商和运单号 |
| 退款申请、审核、详情 | `/order/orders/refund/*` | 只能满足简单退款 | 不能替代现有完整售后工单 |

## 满足度口径

| 等级 | 含义 |
|---|---|
| A 直接满足 | 现有核心交互和数据可由单个 Swagger 接口满足，只需通用响应解包或简单重命名 |
| B 适配满足 | 接口能力完整，通过组合调用、字段转换或本地派生可保持现有交互 |
| C 部分满足 | 存在相关接口，但缺少当前页面所需字段、状态或操作，不能完成闭环 |
| D 当前缺失 | `admin`、`user`、`order` 中均无满足当前能力的接口 |
| 本地能力 | 当前交互不要求后端接口，不计入接口满足度 |

按 65 项已调用 Mock API 能力统计：A 4、B 13、C 19、D 29；A+B 约 `26%`，A+B+C 约 `55%`。

## 认证与当前用户

| 前端需求 | 关键数据/交互 | Swagger 匹配 | 等级 | 差异 |
|---|---|---|---|---|
| 邮箱密码登录 | email、password、token、用户基本信息 | `POST /user/auth/login` + `GET /user/auth/me` | B | 登录只返回 `userId/token/nickname/avatar`，需继续读取 `/auth/me`；`isBuyer` 需由 `roles` 派生 |
| 当前用户初始化 | id、email、nickname、avatar、phone、points、VIP、KYC、买手身份 | `GET /user/auth/me` + `GET /user/points/account` | B | 后端无前端 `status/registeredAt/lastActiveAt`；KYC 枚举需映射，VIP 来自第二个接口 |
| 演示账号切换 | 指定任意 Mock 用户切换会话 | 无真实接口 | D | 属于本地演示能力，正式真实登录不应映射为用户接口 |

## 首页、商品与分类

| 前端需求 | 关键数据/筛选 | Swagger 匹配 | 等级 | 差异 |
|---|---|---|---|---|
| 分类树 | id、name、level、parentId、path、icon、productCount、children | `GET /order/categories/tree` | B | 返回 id/parentId/level/name/sort/enabled/source/childCount/children；缺 code、icon、完整 path、productCount、时间字段 |
| 首页推荐聚合 | hot、newest、flash、topCategories、topSellers | `/order/storefront/recommend`、`best-sellers/page`、`new-arrivals/page`、`flash-sale`、`banners/list` | C | 推荐、热销、新品、秒杀和 Banner 已接入；仍缺 topCategories/topSellers 分布，真实非空数据待验证 |
| 公开商品详情 | 商品、卖家、分类、价格、库存、图文、售后、销量/浏览/收藏 | `GET /order/storefront/product/detail` | C | 真实详情与浏览打点已接入；仍缺 sellerName、categoryPath、aftersaleDays，真实商品暂不进入旧 Mock 购物车 |
| 商品分页/搜索 | keyword、categoryId、售后类型、海外、价格区间、销量/最新/价格排序 | 无公开通用分页接口 | D | `products/my/page` 只查当前卖家商品；榜单接口不支持现有综合筛选 |
| 商品评价分页/评分摘要 | 评价方向、用户、分数、内容、标签、图片、汇总 | 无 | D | 当前 Swagger 没有评价接口 |

## 购物车、地址与订单

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 本地购物车增删改选 | 无需后端 | 本地能力 | 当前使用 Pinia/local storage，真实结算前只需重新校验商品 |
| 地址列表/新增/设默认/删除 | 无 | D | 三组 Swagger 均无收货地址接口 |
| 下单 | `POST /order/orders/create` | C | 后端仅 `productId/quantity/sessionId/remark`；前端需要地址、收件人、运费、税费、多购物项及售后上下文 |
| 订单列表 | `POST /order/orders/bought/page` | C | 基本分页存在；前端 10 状态与后端 7 状态不一致，DTO 缺买手名称、地址、物流、售后配置和金额拆分 |
| 订单详情 | `GET /order/orders/detail` | C | 缺 receiver、shippingAddress、shippingFee、tax、物流单号/承运商、截图、保修、售后关联和状态时间线字段 |
| 订单状态计数 | 多次调用 `orders/bought/page` 可派生 | B | 无独立统计接口；需按状态请求或由列表数据派生，注意分页总数 |
| 支付 | `POST /order/orders/pay` | A | 核心操作存在，ID 需按 Long 原值透传 |
| 确认收货 | `POST /order/orders/confirm` | A | 核心操作存在；后端不接收前端预留的收货视频 |
| 取消订单 | `POST /order/orders/cancel` | C | 后端只接收订单 ID，无法传递现有取消原因；取消/退款语义合并 |

### 2026-08-05 订单契约逐字段复核

| 专项 | live Swagger 事实 | H5 当前需求 | 结论 |
|---|---|---|---|
| 地址 | 三个分组无地址接口；`OrderCreateQO` 无 `addressId` | 地址 CRUD、默认地址、下单地址选择、历史地址快照 | 阻塞下单迁移 |
| 多商品 | `orders/create` 每次只接收一个 `productId` | 购物车多商品一次结算 | 需批量接口或确认逐单创建、幂等和部分失败方案 |
| 金额 | DTO 有 `originalAmount/totalAmount/unitPrice`，无 `shippingFee/taxFee` | 商品、运费、税费和应付总额分开展示 | 需补费用快照并确认计算公式、精度和改价语义 |
| 状态 | DTO 为 7 状态；分页描述只列 5 状态 | H5 为 10 状态并包含采购、售后确认、保修和归档 | 需后端扩展或产品确认收敛，不能前端自行猜测 |
| 物流 | `orders/ship` 只接收订单 ID；DTO 无物流字段 | 地址、采购/发货凭证、承运商、单号、预计到达和轨迹 | 阻塞卖家真实发货 |
| 取消 | `orders/cancel` 只接收 ID | 取消原因、取消方和取消时间 | 需补字段或确认移除现有交互 |
| 退款 | 仅申请、审核、按退款 ID 查详情 | 五类售后、证据、部分退款、列表、按订单查询、撤销和历史 | 只能覆盖简单退款，不能直接替换售后模块 |
| 展示与时间线 | DTO 仅买卖双方 ID 和四个时间字段 | 买卖双方名称、完整进度、取消/退款关联 | 需补名称、关联 ID、原因和状态时间 |
| Long ID | 订单、商品、用户、场次、退款均为 `int64` | H5/JavaScript 保持精度 | 后端需确认 JSON 字符串序列化并接受字符串 ID |

完整后端确认问题与前端实施门禁见 `docs/order-contract-confirmation.md`。本专项只完成 Swagger 核对与缺口整理；真实订单 API 尚未封装，页面仍使用 Mock，也未进行真实订单回归。

## 钱包、充值与提现

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 钱包总览 | `GET /user/wallet/overview` | B | total/todayIn/todayOut/distribution 可适配；前端固定桶字段和钱包地址需由 distribution 映射或后端补充 |
| 总资产 | `GET /user/wallet/overview` 的 `total` | A | 金额为 number，前端应在 API 层转为字符串展示，避免页面浮点运算 |
| 钱包流水 | `POST /user/wallet/ledger/page` | C | 有分页、业务类型和余额；缺链上 hash、地址、refType/refId、费用拆分，筛选项也少于 PC/H5 Mock |
| 发起充值 | `POST /user/recharge/create` + `GET /user/recharge/detail` | C | 页面已改为创建真实充值单、展示 depositAddress/memo 并刷新状态；真实创建和到账流转待验证 |
| 充值/提现记录 | `POST /user/recharge/page`、`GET /user/recharge/detail`、`POST /user/withdraw/page`、`GET /user/withdraw/detail` | B | API、页面和入口已接入；Long ID 保留原值，真实非空记录待验证 |
| 平台链钱包列表 | 无 C 端接口 | D | `admin` 钱包配置不在当前 C 端 Swagger 范围 |
| 发起提现 | `POST /user/withdraw/create` | B | chain/toAddress/amount 匹配；前端支付密码不在接口中，KYC/风控前置规则需后端确认 |

- 2026-08-05 登录账号补充写入回归：`TRON/ETH/BSC` 均未创建出充值单，充值列表保持空记录。请求字段与 live `RechargeCreateQO` 一致，但具体业务错误码未保留；当前状态为“页面已调用、真实写入失败、原因待后端确认”，不是“真实验证通过”。

## 积分与 VIP

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 我的积分与双身份 VIP | `GET /user/points/account` | B | points、customer/buyer 等级、阈值和 benefits 齐全；需适配为前端 audience/config 结构 |
| 积分流水 | `POST /user/points/ledger/page` | B | 核心字段齐全；时间为时间戳，查询缺日期范围和 onlyAppealable |
| 扣分申诉 | `POST /user/points/appeals/submit` | A | `ledgerId/reason` 可直接匹配 |
| 积分申诉记录 | `POST /user/points/appeals/page` | A | API 和页面已接入；展示状态、审核意见和时间，真实非空数据待验证 |
| 积分规则展示 | `GET /admin/point-rules/list` | C | 字段较完整，但属于 admin 分组，Swagger 未声明 C 端访问契约 |
| 全等级 VIP 配置展示 | `GET /admin/vip-configs/get` | C | 可返回双角色维度和等级；同样缺少 C 端公开接口确认 |

## 买手中心

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 买手申请提交/状态 | `POST /user/buyer/apply`、`GET /user/buyer/application` | A | API、页面与入口已接入；真实提交和驳回后重提尚待验证 |
| 我的商品/创建商品 | `POST /order/products/my/page`、`POST /order/products/create`、`GET /order/products/detail`、`PUT /order/products/shelf`、`POST /order/files/upload` | B | API 和页面已接入；图片先上传得到 bucket/filePath，创建/上下架真实写入待验证 |
| 可接求购/抢单 | `POST /order/demands/hall/page`、`POST /order/demands/grab` | C | 操作存在，但大厅 DTO 缺客户名、分类路径、推送层级/时间、审核和取消信息 |
| 买手订单 | `POST /order/orders/sold/page` | C | 基本列表存在，缺当前页面需要的采购/物流截图、承运商、地址和细分状态 |
| 买手押金与经营统计 | `GET /user/wallet/overview`、`GET /user/buyer/application` | C | 无专门押金余额、冻结担保、完成率、好评率、投诉率和发货时效接口 |

## 求购

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 发起求购 | `POST /order/demands/create` | B | 标题、分类、描述、预算、期望天数、海外、售后、图片可匹配；字段需转换 |
| 我的求购/大厅 | `POST /order/demands/my/page`、`POST /order/demands/hall/page` | C | 分页存在；缺前端推送批次、客户/买手名称、审核信息、关联订单号和取消原因 |
| 求购详情 | `GET /order/demands/detail` | C | 主体数据存在；没有 pushLogs 和 pushed buyer 列表 |
| 取消/抢单 | `POST /order/demands/cancel`、`POST /order/demands/grab` | B | 核心操作存在；取消原因无法提交 |
| 手动推下一批 | 无 | D | 后端无对应操作 |

## 当前后端缺失模块

| 模块 | H5 现有需求 | 当前结论 |
|---|---|---|
| KYC | 状态、实名/证件/人脸/手机提交、审核结果 | D：无 C 端 KYC 接口 |
| 理财 | 产品列表/详情、认购、我的锁仓、提前解锁 | D：无理财接口 |
| 评价 | 商品评价、我的评价、评分摘要、提交评价 | D：无评价接口 |
| 完整售后 | 5 类工单、证据、列表、详情、历史、取消 | D/C：只有订单退款申请/审核/详情，不能满足现有售后模型 |
| IM | 订单群、消息列表、发送消息 | D：无 IM 接口 |
| 消息中心 | 系统通知、交易通知、未读数、分类摘要 | D：`notify` Swagger 404 |
| CMS | 公告、帮助文章、协议正文与当前版本 | D：无接口，Banner 不能替代公告 |
| AI 导购 | 自然语言搜索与商品建议 | D：无接口 |

## 后端优先补充清单

1. 收货地址 CRUD、默认地址和结算读取。
2. 面向 C 端的公开商品分页搜索，支持分类、价格、售后、海外和排序。
3. 补齐订单地址、收件人、运费、税费、物流、截图、售后配置、状态时间线，并确认 7 状态与前端 10 状态的映射。
4. KYC、理财、评价、IM/通知、公告/帮助/协议、AI 导购接口。
5. 独立售后工单列表/详情/创建/取消/证据/历史，而不是只提供简单退款。
6. C 端公开的积分规则、VIP 全等级配置及充值收款地址契约。
7. 求购推送批次/日志、买手经营统计和带物流字段的卖家发货接口。

## 状态说明

- 本文只表示 Swagger 契约匹配，不表示真实 API 已封装、页面已调用或浏览器已验证。
- 所有 Long ID 必须保持原始值；Swagger 中 `int64` 不得在页面层随意转为 `number`。
- 字段差异后续优先在 API adapter 处理；涉及交互缺失时先与后端或用户确认。
