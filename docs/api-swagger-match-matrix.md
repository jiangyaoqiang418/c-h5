# Swagger 真实接口匹配矩阵

> 本矩阵按油宝 C 端 H5 的真实页面交互、字段和操作核对，不以 Mock 函数名相似作为接口满足依据。

## 扫描范围与 Swagger 快照

- 前端：41 个页面、33 个组件、4 个 Store、16 个 Mock API 模块及相关类型。
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

- H5 直连该服务的跨域预检返回 HTTP 403；上述读取验证经本地 `/api/*` Vite 代理完成。部署 H5 与 Android/iOS 仍须完整 HTTPS 服务地址。
- 状态严格区分：前四项为真实读取已验证；提现仅为 API 已封装和页面已调用，不能标记真实接口已验证。

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
| 首页推荐聚合 | hot、newest、flash、topCategories、topSellers | `/order/storefront/recommend`、`best-sellers/page`、`new-arrivals/page`、`flash-sale`、`banners/list` | C | 可组合商品榜单、秒杀和 Banner；没有 topCategories/topSellers 分布，返回结构需重组 |
| 公开商品详情 | 商品、卖家、分类、价格、库存、图文、售后、销量/浏览/收藏 | `GET /order/storefront/product/detail` | C | 缺 sellerName、categoryPath、aftersaleDays；images 为字符串数组；状态和字段命名不同 |
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

## 钱包、充值与提现

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 钱包总览 | `GET /user/wallet/overview` | B | total/todayIn/todayOut/distribution 可适配；前端固定桶字段和钱包地址需由 distribution 映射或后端补充 |
| 总资产 | `GET /user/wallet/overview` 的 `total` | A | 金额为 number，前端应在 API 层转为字符串展示，避免页面浮点运算 |
| 钱包流水 | `POST /user/wallet/ledger/page` | C | 有分页、业务类型和余额；缺链上 hash、地址、refType/refId、费用拆分，筛选项也少于 PC/H5 Mock |
| 发起充值 | `POST /user/recharge/create` + `GET /user/recharge/detail` | C | 可创建并获取 depositAddress/txHash/status；当前页面先展示平台链钱包再模拟入账，流程契约不同 |
| 平台链钱包列表 | 无 C 端接口 | D | `admin` 钱包配置不在当前 C 端 Swagger 范围 |
| 发起提现 | `POST /user/withdraw/create` | B | chain/toAddress/amount 匹配；前端支付密码不在接口中，KYC/风控前置规则需后端确认 |

## 积分与 VIP

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 我的积分与双身份 VIP | `GET /user/points/account` | B | points、customer/buyer 等级、阈值和 benefits 齐全；需适配为前端 audience/config 结构 |
| 积分流水 | `POST /user/points/ledger/page` | B | 核心字段齐全；时间为时间戳，查询缺日期范围和 onlyAppealable |
| 扣分申诉 | `POST /user/points/appeals/submit` | A | `ledgerId/reason` 可直接匹配 |
| 积分规则展示 | `GET /admin/point-rules/list` | C | 字段较完整，但属于 admin 分组，Swagger 未声明 C 端访问契约 |
| 全等级 VIP 配置展示 | `GET /admin/vip-configs/get` | C | 可返回双角色维度和等级；同样缺少 C 端公开接口确认 |

## 买手中心

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 我的商品/创建商品 | `POST /order/products/my/page`、`POST /order/products/create`、`POST /order/files/upload` | B | 核心能力存在；图片需先上传得到 bucket/filePath，字段和售后枚举需转换 |
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
