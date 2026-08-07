import { realUserRequest } from '../request';

export interface AddressRecord {
  id: Api.RealAddress.LongId;
  receiverName: string;
  receiverPhone: string;
  country: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  postalCode?: string;
  idCardNo?: string;
  isDefault: boolean;
  tag?: string;
}

export interface AddressForm {
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}

function toAddressRecord(address: Api.RealAddress.UserAddressVO): AddressRecord {
  return {
    id: address.id,
    receiverName: address.receiverName || '',
    receiverPhone: address.receiverPhone || '',
    country: address.country || '',
    province: address.province || '',
    city: address.city || '',
    district: address.district || '',
    detail: address.detailAddress || '',
    postalCode: address.postalCode,
    idCardNo: address.idCardNo,
    isDefault: address.defaultFlag === true,
    tag: address.tag
  };
}

function toSaveQO(form: AddressForm, id?: Api.RealAddress.LongId): Api.RealAddress.UserAddressSaveQO {
  return {
    id,
    receiverName: form.receiverName,
    receiverPhone: form.receiverPhone,
    country: '中国',
    province: form.province,
    city: form.city,
    district: form.district,
    detailAddress: form.detail,
    defaultFlag: form.isDefault
  };
}

export async function fetchMyAddresses(): Promise<AddressRecord[]> {
  const addresses = await realUserRequest<Api.RealAddress.UserAddressVO[]>({ url: '/addresses/list' });
  return addresses.map(toAddressRecord);
}

export function createAddress(form: AddressForm): Promise<Api.RealAddress.LongId> {
  return realUserRequest<Api.RealAddress.LongId, Api.RealAddress.UserAddressSaveQO>({
    url: '/addresses/create',
    method: 'POST',
    data: toSaveQO(form)
  });
}

export function updateAddress(id: Api.RealAddress.LongId, form: AddressForm): Promise<Api.RealAddress.LongId> {
  return realUserRequest<Api.RealAddress.LongId, Api.RealAddress.UserAddressSaveQO>({
    url: '/addresses/update',
    method: 'PUT',
    data: toSaveQO(form, id)
  });
}

export function setDefaultAddress(id: Api.RealAddress.LongId): Promise<void> {
  return realUserRequest<void, { id: Api.RealAddress.LongId }>({
    url: '/addresses/default',
    method: 'PUT',
    data: { id }
  });
}

export function deleteAddress(id: Api.RealAddress.LongId): Promise<void> {
  return realUserRequest<void>({ url: '/addresses/delete', method: 'DELETE', params: { id } });
}

export async function fetchAddressDetail(id: Api.RealAddress.LongId): Promise<AddressRecord> {
  const address = await realUserRequest<Api.RealAddress.UserAddressVO>({ url: '/addresses/detail', params: { id } });
  return toAddressRecord(address);
}

export function fetchAddressPage(query: Api.RealAddress.UserAddressPageQuery = {}) {
  return realUserRequest<Api.RealAddress.UserAddressPage, Api.RealAddress.UserAddressPageQuery>({
    url: '/addresses/page',
    method: 'POST',
    data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 20, keyword: query.keyword, defaultFlag: query.defaultFlag }
  });
}
