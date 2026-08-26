import { realUserRequest, realUserUpload } from '../request';

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

export function uploadKycFile(filePath: string) {
  return realUserUpload<Api.RealKyc.FileUploadResult>({
    url: '/kyc/files/upload',
    filePath,
    name: 'file'
  });
}

export function fetchKycFileAccess(fileId: Api.RealKyc.Id) {
  return realUserRequest<Api.RealKyc.FileAccessResult>({
    url: '/kyc/files/access',
    params: { fileId }
  });
}
