import { realUserRequest, realUserUpload } from '../request';

export async function fetchKycSchema() {
  const schema = await realUserRequest<Api.RealKyc.Schema>({ url: '/kyc/schema' });
  if (!schema || !Number.isSafeInteger(schema.version) || schema.version < 1
    || !Array.isArray(schema.allowedIdTypes) || !schema.allowedIdTypes.length || schema.allowedIdTypes.some(type => !['ID_CARD', 'PASSPORT'].includes(type))
    || [schema.nationalityRequired, schema.idCardBackRequired, schema.holdingPhotoRequired, schema.resubmitAfterRejectAllowed].some(value => typeof value !== 'boolean')) throw new Error('认证配置不完整，请重新加载');
  return schema;
}

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
