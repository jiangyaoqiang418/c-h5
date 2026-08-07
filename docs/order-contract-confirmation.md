# H5 订单契约确认清单

## 目的与结论

- 2026-08-07 更新：`user` 已新增收货地址 CRUD、分页、详情和设默认接口；`order` 最新为 43 路径/45 操作/63 schema，文档和网关均为 HTTP 200。新增公开商品分页、合并下单和订单组付款，并补齐下单地址、幂等、地址快照、金额拆分、物流及取消信息。本文 2026-08-05 的地址、多商品、金额和物流阻塞已大部分解除，订单状态与完整售后仍需确认。
- 最新核对时间：2026-08-07；下方仍保留 2026-08-05 问题的解决过程，最终实施以本次结论为准。
- live Swagger：`admin` 107 路径/108 操作、`user` 32/32、`order` 43/45，`notify` HTTP 404。
- 本文只整理后端契约确认项，不表示 H5 订单 API 已封装、页面已调用或真实回归通过。
- 当前单商品/合并下单、订单列表/详情、单笔/订单组付款、确认收货、带原因取消、带物流发货和简单退款接口均存在；已可进入分批迁移评估，但完整五类售后与前端 10 状态仍不能无损承接。迁移前继续保持 Mock 数据链隔离，迁移后禁止失败回退 Mock。

## 当前 live Swagger 事实

| 能力 | 接口 | 当前契约 |
|---|---|---|
| 下单 | `POST /order/orders/create`、`create-batch` | 单品和最多20项合并下单均要求 `addressId`，支持 `idempotencyKey`；批量整批失败不落单并返回订单组 |
| 买家/卖家列表 | `POST /order/orders/bought/page`、`POST /order/orders/sold/page` | `pageNo/pageSize/status`；同一 `OrderDTO` |
| 详情 | `GET /order/orders/detail?id=` | 返回 `OrderDTO` |
| 支付/确认 | `POST /order/orders/pay`、`group/pay`、`confirm` | 支持单笔/订单组付款；确认收货按 Long `id` |
| 取消/发货 | `POST /order/orders/cancel`、`ship` | 取消要求 `id/reason`；发货要求 `id/logisticsCompany/trackingNo`，可带公司编码、凭证和备注 |
| 卖家改价 | `PUT /order/orders/price` | `id/amount`，修改待付款订单当前应付金额 |
| 退款 | `POST /order/orders/refund/apply`、`review`，`GET /order/orders/refund/detail` | 买家提交 `orderId/reason`；卖家提交 `refundId/agree/reviewRemark` |

`OrderDTO` 已包含订单组、买卖双方名称、商品快照、金额与运费/税费、完整地址快照、物流、取消信息、退款摘要和基础时间线。尚缺物流轨迹/预计送达，以及换货、维修、部分退款等完整售后结构。

## 仍需确认或回归的契约

### 1. 地址与下单快照

1. 地址 CRUD、`OrderCreateQO.addressId` 与 `OrderDTO` 地址快照均已补齐，地址和下单主链门禁解除。
2. 仍需用真实订单验证用户修改/删除地址后历史订单快照不变。
3. 明确海外地址、地区编码和清关证件信息的展示范围；当前地址接口支持国家、邮编和证件号，但订单快照未返回证件号。

### 2. 单商品与多商品结算

1. `POST /orders/create-batch` 已支持最多20项合并下单、同一地址、整批失败不落单和幂等键；返回订单组号、订单 ID 列表和应付总额。
2. `POST /orders/group/pay` 已支持订单组一次付款，前端无需逐单创建或逐单付款。
3. 仍需真实验证商品失效、库存不足、秒杀变化、重复幂等键和余额不足时的整批原子性与错误码。

### 3. 金额含义与精度

1. `originalAmount` 已明确为商品原价×数量+运费+税费，`totalAmount` 为当前应付金额，并已返回 `shippingFee/taxFee`。
2. 仍需确认卖家改价只修改最终应付总额还是商品金额，以及改价后运费、税费是否保持不变。
3. 金额字段仍需明确小数位、舍入规则和允许范围。前端展示按字符串处理，不能依赖 JavaScript 浮点计算作为结算依据。

### 4. 订单状态与筛选

live `OrderDTO.status` 与 `OrderPageQuery.status` 均已明确支持 7 状态：

`CREATED / PAID / SHIPPED / REFUND_REVIEW / REFUNDED / COMPLETED / CANCELED`

H5 当前 10 状态不能直接一一映射：

| H5 当前状态 | 后端候选状态 | 待确认 |
|---|---|---|
| `PENDING_PAYMENT` | `CREATED` | 可直接映射 |
| `PROCURING/PROCURED` | `PAID` | 后端是否接受合并采购中和已采购 |
| `IN_TRANSIT` | `SHIPPED` | 可直接映射，但缺物流信息 |
| `AFTERSALE_CONFIRM/IN_AFTERSALE` | `REFUND_REVIEW` | 当前 H5 包含换货、维修等，不等同于退款审核 |
| `COMPLETED/WARRANTY/ARCHIVED` | `COMPLETED` | 需确认保修期和归档是否由前端派生或后端补状态 |
| `CANCELLED` | `CANCELED` | 可直接映射 |
| 无对应状态 | `REFUNDED` | H5 需新增退款完成展示或由售后状态承接 |

后端需选择：扩展订单状态，或由产品确认 H5 收敛为后端 7 状态。前端不能自行猜测合并业务语义。

### 5. 物流与卖家发货

1. 发货请求已支持物流公司、公司编码、运单号、最多6张凭证和备注；订单 DTO 也返回对应字段，卖家基础发货门禁解除。
2. 当前仍无预计送达时间和物流轨迹接口；需确认本期隐藏轨迹交互，还是后端补独立查询与事件结构。
3. 采购凭证与发货凭证是否合并使用 `shipVouchers` 仍需产品确认。

### 6. 取消与退款

1. `POST /order/orders/cancel` 已要求 `id/reason`，DTO 返回原因、取消时间和操作人，取消原因门禁解除。
2. live 描述显示：待付款取消、已付款未发货退款均走 `cancel`；已发货后才走 `refund/apply`。需明确两类操作的状态、资金流水和库存回补结果。
3. 简单退款仅支持 `reason`，不能表达 H5 的退款、退货退款、换货、维修、部分退款五类工单，也没有证据图片、申请金额和退货物流。
4. 订单 DTO 已返回最新 `refundId/refundStatus/refundAmount`，但仍没有退款列表、撤销退款或退款历史接口。
5. 明确退款金额是否固定为订单 `totalAmount`，是否允许部分退款，以及卖家驳回后订单恢复状态和时间字段。

### 7. 展示字段、时间线与 Long ID

1. `OrderDTO` 已补 `customerName/sellerName` 以及取消和退款摘要，基础订单卡片信息已满足。
2. 仍缺 `refundAppliedAt/refundedAt` 等完整售后时间线；取消时间已经补齐。
3. 所有订单、商品、用户、秒杀场次和退款 ID 均为 `int64`。需确认服务端 JSON 响应统一序列化为字符串，并接受字符串形式 ID 请求，避免 H5/JavaScript 精度丢失。
4. 支付、确认、取消、发货、改价和退款写操作需明确幂等行为及业务错误码，供 H5 区分余额不足、状态冲突、库存变化和重复提交。

## 后端确认后的前端实施门禁

1. 更新 live Swagger，并在接口矩阵记录最终字段和状态方案。
2. 新增真实订单类型和 `src/service/api/order.ts` adapter，Long ID 全程保留原值。
3. 先接只读列表/详情，再接下单、支付、取消、确认收货、卖家发货和退款写入。
4. 迁移后的订单模块禁止失败回退 Mock；地址、订单和售后必须使用同一真实数据链路。
5. 使用具备地址、余额、买手身份和对应状态订单的账号，分别验证读取、空态、业务错误和写入闭环。
