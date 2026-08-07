declare namespace Api {
  namespace RealAddress {
    type LongId = string | number;

    interface UserAddressSaveQO {
      id?: LongId;
      receiverName: string;
      receiverPhone: string;
      country: string;
      province?: string;
      city?: string;
      district?: string;
      detailAddress: string;
      postalCode?: string;
      idCardNo?: string;
      defaultFlag?: boolean;
      tag?: string;
    }

    interface UserAddressVO {
      id: LongId;
      receiverName?: string;
      receiverPhone?: string;
      country?: string;
      province?: string;
      city?: string;
      district?: string;
      detailAddress?: string;
      postalCode?: string;
      idCardNo?: string;
      defaultFlag?: boolean;
      tag?: string;
      createdAt?: string | number;
      updatedAt?: string | number;
    }

    interface UserAddressPageQuery {
      pageNo?: number;
      pageSize?: number;
      keyword?: string;
      defaultFlag?: boolean;
    }

    interface UserAddressPage {
      pageNo?: number;
      pageSize?: number;
      total: number;
      records: UserAddressVO[];
    }
  }
}
