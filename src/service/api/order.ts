import { realOrderRequest } from '../request';

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

export function fetchBoughtOrders(query: Api.RealOrder.OrderPageQuery = {}) {
  return fetchOrderPage('bought', query);
}

export function fetchSoldOrders(query: Api.RealOrder.OrderPageQuery = {}) {
  return fetchOrderPage('sold', query);
}

export function fetchOrderDetail(id: Api.RealOrder.LongId) {
  return realOrderRequest<Api.RealOrder.OrderDTO>({
    url: '/orders/detail',
    params: { id }
  });
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
