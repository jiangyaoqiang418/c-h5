import { realOrderRequest } from '../request';

const DISPLAY_STATUS: Record<Api.RealOrder.OrderStatus, Api.Order.OrderStatus> = {
  CREATED: 'PENDING_PAYMENT',
  PAID: 'PROCURING',
  SHIPPED: 'IN_TRANSIT',
  REFUND_REVIEW: 'IN_AFTERSALE',
  REFUNDED: 'REFUNDED',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELLED'
};

function joinAddress(order: Api.RealOrder.OrderDTO) {
  return [order.country, order.province, order.city, order.district, order.detailAddress]
    .filter(Boolean)
    .join(' ') || '暂未填写收货地址';
}

/** Swagger 时间字段在当前服务中会以数字字符串返回，Date 不能直接解析该形式。 */
function normalizeTime(value: string | number | undefined) {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

/** 将真实订单契约收敛到当前页面所需字段，页面不感知后端字段差异。 */
export function toOrderView(
  order: Api.RealOrder.OrderDTO,
  scope: 'bought' | 'sold' = 'bought'
): Api.RealOrder.OrderView {
  return {
    id: order.orderId,
    code: order.orderNo || order.orderGroupNo || String(order.orderId),
    rawStatus: order.status,
    status: DISPLAY_STATUS[order.status],
    productId: order.productId,
    productTitle: order.productTitle || '商品信息待补充',
    productCover: order.productImage,
    counterpartLabel: scope === 'sold' ? '顾客' : '买手',
    counterpartName: scope === 'sold'
      ? (order.customerName || '暂未填写顾客')
      : (order.sellerName || '暂未分配买手'),
    price: order.unitPrice ?? order.originalAmount ?? order.totalAmount ?? 0,
    shippingFee: order.shippingFee ?? 0,
    tax: order.taxFee ?? 0,
    totalAmount: order.totalAmount ?? 0,
    shippingAddress: joinAddress(order),
    receiverName: order.receiverName || '—',
    receiverPhone: order.receiverPhone || '—',
    createdAt: normalizeTime(order.createdAt),
    paidAt: normalizeTime(order.paidAt),
    shippedAt: normalizeTime(order.shippedAt),
    completedAt: normalizeTime(order.completedAt),
    canceledAt: normalizeTime(order.canceledAt),
    cancelReason: order.cancelReason
  };
}

function fetchOrderPage(scope: 'bought' | 'sold', query: Api.RealOrder.OrderPageQuery = {}) {
  return realOrderRequest<Api.RealOrder.OrderPage, Api.RealOrder.OrderPageQuery>({
    url: `/orders/${scope}/page`,
    method: 'POST',
    data: {
      pageNo: query.pageNo || 1,
      pageSize: query.pageSize || 20,
      status: query.status
    }
  });
}

export async function fetchBoughtOrders(query: Api.RealOrder.OrderPageQuery = {}) {
  const page = await fetchOrderPage('bought', query);
  return { ...page, records: page.records.map(order => toOrderView(order, 'bought')) };
}

export async function fetchSoldOrders(query: Api.RealOrder.OrderPageQuery = {}) {
  const page = await fetchOrderPage('sold', query);
  return { ...page, records: page.records.map(order => toOrderView(order, 'sold')) };
}

export async function fetchOrderDetail(id: Api.RealOrder.LongId, scope: 'bought' | 'sold' = 'bought') {
  const order = await realOrderRequest<Api.RealOrder.OrderDTO>({
    url: '/orders/detail',
    params: { id }
  });
  return toOrderView(order, scope);
}

/**
 * 只建立真实合并下单的 API 边界；结算页接入与支付属于后续独立迁移。
 * 商品和地址 ID 保持 Long 原值，避免在页面层转换为 number。
 */
export function createBatchOrder(params: Api.RealOrder.OrderCreateBatchParams) {
  if (params.items.length === 0 || params.items.length > 20) {
    throw new Error('一次下单的商品数量必须在 1 到 20 件之间');
  }
  return realOrderRequest<Api.RealOrder.OrderGroupVO, Api.RealOrder.OrderCreateBatchParams>({
    url: '/orders/create-batch',
    method: 'POST',
    data: params
  });
}

export function cancelRealOrder(params: Api.RealOrder.OrderCancelParams): Promise<Api.RealOrder.LongId> {
  return realOrderRequest<Api.RealOrder.LongId, Api.RealOrder.OrderCancelParams>({
    url: '/orders/cancel',
    method: 'POST',
    data: params
  });
}

export function confirmRealOrder(id: Api.RealOrder.LongId): Promise<Api.RealOrder.LongId> {
  return realOrderRequest<Api.RealOrder.LongId, { id: Api.RealOrder.LongId }>({
    url: '/orders/confirm',
    method: 'POST',
    data: { id }
  });
}
