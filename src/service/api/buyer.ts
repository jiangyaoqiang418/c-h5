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
