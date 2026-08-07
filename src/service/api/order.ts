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
