import { realUserRequest } from '../request';

export function fetchKycDetail() {
  return realUserRequest<Api.RealKyc.DetailVO | null>({ url: '/kyc/detail' });
}

export function submitKyc(params: Api.RealKyc.SubmitParams) {
  return realUserRequest<Api.RealKyc.Id, Api.RealKyc.SubmitParams>({
    url: '/kyc/submit',
    method: 'POST',
    data: params
  });
}
