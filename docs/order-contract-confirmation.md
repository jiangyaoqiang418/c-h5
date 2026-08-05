# H5 订单契约确认清单

## 目的与结论

- 核对时间：2026-08-05。
- live Swagger：`admin` 84 路径/85 操作、`user` 19/19、`order` 40/42，`notify` HTTP 404。
- 本文只整理后端契约确认项，不表示 H5 订单 API 已封装、页面已调用或真实回归通过。
- 当前 `POST /order/orders/create`、订单列表/详情、支付、确认收货、取消、发货和简单退款接口均存在，但不足以无损承接 H5 现有结算、物流和五类售后交互。后端确认前，订单相关页面继续保留 Mock，不增加真实接口失败回退。

## 当前 live Swagger 事实

| 能力 | 接口 | 当前契约 |
|---|---|---|
| 下单 | `POST /order/orders/create` | `productId` 必填；可选 `quantity/sessionId/remark`；返回 Long 订单 ID |
| 买家/卖家列表 | `POST /order/orders/bought/page`、`POST /order/orders/sold/page` | `pageNo/pageSize/status`；同一 `OrderDTO` |
| 详情 | `GET /order/orders/detail?id=` | 返回 `OrderDTO` |
| 支付/确认/取消/发货 | `POST /order/orders/pay`、`confirm`、`cancel`、`ship` | 请求体均只有 Long `id` |
| 卖家改价 | `PUT /order/orders/price` | `id/amount`，修改待付款订单当前应付金额 |
| 退款 | `POST /order/orders/refund/apply`、`review`，`GET /order/orders/refund/detail` | 买家提交 `orderId/reason`；卖家提交 `refundId/agree/reviewRemark` |

`OrderDTO` 当前只有订单 ID/编号/类型/状态、买卖双方 ID、单商品快照、`originalAmount/totalAmount/unitPrice/quantity`、备注和四个时间字段。未返回地址、物流、买卖双方名称、费用拆分、取消信息、退款关联及完整时间线。

## 必须由后端确认的契约

### 1. 地址与下单快照

1. 增加 C 端收货地址列表、新增、编辑、删除和设默认接口；当前三个 Swagger 分组均无地址路径。
2. `OrderCreateQO` 至少增加 `addressId`，由后端在下单时固化收件人、手机号、地区和详细地址快照。
3. `OrderDTO` 增加 `receiverName/receiverPhone/shippingAddress`，不能只在地址表保留实时值，否则用户修改地址会污染历史订单。
4. 明确海外地址、地区编码和清关信息是否属于本期；若不支持，H5 需隐藏对应入口，而不是继续提交 Mock 字段。

### 2. 单商品与多商品结算

1. 当前 H5 购物车支持多商品一次结算，Swagger 每次只能提交一个 `productId`。
2. 后端需确认采用批量下单接口，还是前端逐商品创建多个订单。
3. 若允许前端逐单创建，需定义幂等键、部分成功处理、库存回滚和支付失败恢复，避免生成一半订单。
4. 下单时必须由后端重新校验商品状态、库存、秒杀场次和价格；前端购物车金额只用于展示。

### 3. 金额含义与精度

1. 明确 `originalAmount`、`unitPrice`、`totalAmount` 的计算公式，以及 `shippingFee/taxFee` 是否已包含在 `totalAmount`。
2. `OrderDTO` 增加下单时的 `shippingFee/taxFee` 快照；否则 H5 订单详情无法展示现有金额明细。
3. 明确卖家改价只修改商品金额还是最终应付总额，以及改价后运费、税费是否保持不变。
4. 金额字段需明确小数位、舍入规则和允许范围。前端展示按字符串处理，不能依赖 JavaScript 浮点计算作为结算依据。

### 4. 订单状态与筛选

live `OrderDTO.status` 为 7 状态：

`CREATED / PAID / SHIPPED / REFUND_REVIEW / REFUNDED / COMPLETED / CANCELED`

但 `OrderPageQuery.status` 描述只列出 5 状态，需确认列表是否支持查询 `REFUND_REVIEW/REFUNDED`。

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

1. 当前 `POST /order/orders/ship` 只有订单 `id`，无法提交承运商、物流单号、发货凭证或采购凭证。
2. 卖家订单列表和详情缺收货地址，当前契约下买手无法完成真实发货。
3. 建议发货请求增加 `carrier/trackingNumber/shippingProof`；图片字段沿用 `POST /order/files/upload` 返回的 `bucket/filePath` 结构。
4. `OrderDTO` 增加物流单号、承运商、发货凭证、预计送达时间；如需物流轨迹，补充独立查询接口和轨迹事件结构。
5. 若本期明确不接采购截图、发货截图或物流轨迹，需由产品确认删除 H5 对应交互后再迁移。

### 6. 取消与退款

1. `POST /order/orders/cancel` 只接收订单 ID，H5 当前取消原因无法提交；需增加 `reason` 或确认前端移除原因。
2. live 描述显示：待付款取消、已付款未发货退款均走 `cancel`；已发货后才走 `refund/apply`。需明确两类操作的状态、资金流水和库存回补结果。
3. 简单退款仅支持 `reason`，不能表达 H5 的退款、退货退款、换货、维修、部分退款五类工单，也没有证据图片、申请金额和退货物流。
4. 当前没有退款列表、按订单查询退款、撤销退款或退款历史接口；订单 DTO 也没有 `refundId`。至少需要订单关联退款 ID/状态，或提供按订单查询接口。
5. 明确退款金额是否固定为订单 `totalAmount`，是否允许部分退款，以及卖家驳回后订单恢复状态和时间字段。

### 7. 展示字段、时间线与 Long ID

1. `OrderDTO` 增加 `customerName/sellerName`，否则买家卡片无法显示买手名，卖家卡片无法显示顾客名。
2. 增加 `canceledAt/refundAppliedAt/refundedAt` 及取消原因、取消方、退款关联；现有四个时间字段不足以生成完整进度时间线。
3. 所有订单、商品、用户、秒杀场次和退款 ID 均为 `int64`。需确认服务端 JSON 响应统一序列化为字符串，并接受字符串形式 ID 请求，避免 H5/JavaScript 精度丢失。
4. 支付、确认、取消、发货、改价和退款写操作需明确幂等行为及业务错误码，供 H5 区分余额不足、状态冲突、库存变化和重复提交。

## 后端确认后的前端实施门禁

1. 更新 live Swagger，并在接口矩阵记录最终字段和状态方案。
2. 新增真实订单类型和 `src/service/api/order.ts` adapter，Long ID 全程保留原值。
3. 先接只读列表/详情，再接下单、支付、取消、确认收货、卖家发货和退款写入。
4. 迁移后的订单模块禁止失败回退 Mock；地址、订单和售后必须使用同一真实数据链路。
5. 使用具备地址、余额、买手身份和对应状态订单的账号，分别验证读取、空态、业务错误和写入闭环。
