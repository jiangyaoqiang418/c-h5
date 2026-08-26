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
    orderGroupNo: order.orderGroupNo,
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

/**
 * 订单概况没有独立统计接口，按后端 7 个真实状态请求第一页并读取 total。
 * 计数必须跟随当前身份，不能再使用 Mock 订单数据。
 */
async function countOrdersByStatus(scope: 'bought' | 'sold') {
  const statuses: Api.RealOrder.OrderStatus[] = [
    'CREATED',
    'PAID',
    'SHIPPED',
    'REFUND_REVIEW',
    'REFUNDED',
    'COMPLETED',
    'CANCELED'
  ];
  const pages = await Promise.all(statuses.map(status => fetchOrderPage(scope, {
    pageNo: 1,
    pageSize: 1,
    status
  })));

  return Object.fromEntries(pages.map((page, index) => [
    statuses[index],
    Number(page.total || 0)
  ])) as Record<Api.RealOrder.OrderStatus, number>;
}

export function countBoughtOrdersByStatus() {
  return countOrdersByStatus('bought');
}

export function countSoldOrdersByStatus() {
  return countOrdersByStatus('sold');
}

export async function fetchOrderDetail(id: Api.RealOrder.LongId, scope: 'bought' | 'sold' = 'bought') {
  const order = await realOrderRequest<Api.RealOrder.OrderDTO>({
    url: '/orders/detail',
    params: { id }
  });
  return toOrderView(order, scope);
}

/** 商品、地址和订单组号均保持服务端原值，页面层不转换 Long ID。 */
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

export function payRealOrderGroup(params: Api.RealOrder.OrderGroupPayParams): Promise<number> {
  return realOrderRequest<number, Api.RealOrder.OrderGroupPayParams>({
    url: '/orders/group/pay',
    method: 'POST',
    data: params
  });
}

export function shipRealOrder(params: Api.RealOrder.OrderShipParams): Promise<Api.RealOrder.LongId> {
  return realOrderRequest<Api.RealOrder.LongId, Api.RealOrder.OrderShipParams>({
    url: '/orders/ship',
    method: 'POST',
    data: params
  });
}

export function fetchOrderLogistics(orderId: Api.RealOrder.LongId) {
  return realOrderRequest<Api.RealOrder.LogisticsDTO>({ url: '/orders/logistics', params: { orderId } });
}

export function createRealRefund(params: Api.RealOrder.OrderRefundApplyParams): Promise<Api.RealOrder.LongId> {
  return realOrderRequest<Api.RealOrder.LongId, Api.RealOrder.OrderRefundApplyParams>({ url: '/orders/refunds/create', method: 'POST', data: params });
}

export function cancelRealRefund(refundId: Api.RealOrder.LongId): Promise<Api.RealOrder.LongId> {
  return realOrderRequest<Api.RealOrder.LongId, { refundId: Api.RealOrder.LongId }>({ url: '/orders/refunds/cancel', method: 'POST', data: { refundId } });
}

export function fetchBoughtRefunds(query: Api.RealOrder.OrderRefundPageQuery = {}) {
  return realOrderRequest<Api.RealOrder.OrderRefundPage, Api.RealOrder.OrderRefundPageQuery>({ url: '/orders/refunds/bought/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20, orderNo: query.orderNo, status: query.status } });
}

export function fetchSoldRefunds(query: Api.RealOrder.OrderRefundPageQuery = {}) {
  return realOrderRequest<Api.RealOrder.OrderRefundPage, Api.RealOrder.OrderRefundPageQuery>({ url: '/orders/refunds/sold/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20, orderNo: query.orderNo, status: query.status } });
}

export function fetchRealRefundDetail(id: Api.RealOrder.LongId) {
  return realOrderRequest<Api.RealOrder.OrderRefundDTO>({ url: '/orders/refunds/detail', params: { id } });
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
