import { realUserRequest } from '../request';

export function fetchBuyerApplication(): Promise<Api.RealUser.BuyerApplicationDTO | null> {
  return realUserRequest<Api.RealUser.BuyerApplicationDTO | null>({
    url: '/buyer/application'
  });
}
