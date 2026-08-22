import { realUserRequest } from '../request';

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
