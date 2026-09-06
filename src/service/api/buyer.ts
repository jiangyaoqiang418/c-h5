import { realUserRequest, realOrderRequest } from '../request';

function statsNumber(value: unknown, integer = false): number {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isSafeInteger(number))) throw new Error('经营数据响应不完整');
  return number;
}

export async function fetchBuyerBusinessStats(query: { startTime?: number; endTime?: number } = {}) {
  const stats = await realOrderRequest<Api.RealOrder.BusinessStats>({ url: '/stats/mine', params: query });
  if (!stats) throw new Error('经营数据响应不完整');
  // 实际响应的计数与 BigDecimal 可能为字符串，按契约归一化，sellerId 原样保留。
  const result = { ...stats };
  for (const key of ['completedOrderCount', 'reviewedOrderCount', 'orderCount', 'refundCount', 'shippedOrderCount', 'avgShipDurationMs'] as const) {
    result[key] = statsNumber(stats[key], true);
  }
  for (const key of ['reviewRate', 'complaintRate', 'avgShipDurationHours'] as const) {
    result[key] = statsNumber(stats[key]);
  }
  return result;
}

export function fetchBuyerApplication(): Promise<Api.RealUser.BuyerApplicationDTO | null> {
  return realUserRequest<Api.RealUser.BuyerApplicationDTO | null>({
    url: '/buyer/application'
  });
}

export function applyBuyer(params: Api.RealUser.BuyerApplyParams): Promise<string | number> {
  return realUserRequest<string | number, Api.RealUser.BuyerApplyParams>({
    url: '/buyer/apply',
    method: 'POST',
    data: params
  });
}

export function fetchBuyerDepositLedger(query: Api.RealUser.BuyerDepositLedgerQuery = {}) {
  return realUserRequest<Api.RealUser.BuyerDepositLedgerPage, Api.RealUser.BuyerDepositLedgerQuery>({
    url: '/buyer/deposit/page',
    method: 'POST',
    data: {
      pageNo: query.pageNo || 1,
      pageSize: query.pageSize || 50,
      bizType: query.bizType
    }
  });
}

export function payBuyerDeposit(params: Api.RealUser.BuyerDepositParams): Promise<string | number> {
  return realUserRequest<string | number, Api.RealUser.BuyerDepositParams>({
    url: '/buyer/deposit/pay',
    method: 'POST',
    data: params
  });
}

export function refundBuyerDeposit(params: Api.RealUser.BuyerDepositParams): Promise<string | number> {
  return realUserRequest<string | number, Api.RealUser.BuyerDepositParams>({
    url: '/buyer/deposit/refund',
    method: 'POST',
    data: params
  });
}
