import { realUserRequest } from '../request';

export function fetchFinanceProducts() { return realUserRequest<Api.RealFinance.ProductVO[]>({ url: '/finance/products/list' }); }
export function fetchFinanceProductDetail(id: Api.RealFinance.Id) { return realUserRequest<Api.RealFinance.ProductVO>({ url: '/finance/products/detail', params: { id } }); }
export function subscribeFinance(params: Api.RealFinance.SubscribeParams) { return realUserRequest<Api.RealFinance.Id, Api.RealFinance.SubscribeParams>({ url: '/finance/orders/subscribe', method: 'POST', data: params }); }
export function fetchFinanceOrders(query: Api.RealFinance.OrderPageQuery = {}) { return realUserRequest<Api.RealFinance.Page<Api.RealFinance.OrderVO>, Api.RealFinance.OrderPageQuery>({ url: '/finance/orders/page', method: 'POST', data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20, status: query.status, productId: query.productId } }); }
export function fetchFinanceOrderDetail(id: Api.RealFinance.Id) { return realUserRequest<Api.RealFinance.OrderVO>({ url: '/finance/orders/detail', params: { id } }); }
export function redeemFinanceOrder(id: Api.RealFinance.Id) { return realUserRequest<Api.RealFinance.Id, { id: Api.RealFinance.Id }>({ url: '/finance/orders/redeem', method: 'POST', data: { id } }); }
export function fetchFinanceOverview() { return realUserRequest<Api.RealFinance.OverviewVO>({ url: '/finance/orders/overview' }); }
