declare namespace Api.RealKyc {
  type Id = string | number;
  type Status = 'PENDING' | 'PASSED' | 'REJECTED';

  interface DetailVO {
    id: Id;
    realName?: string;
    idType?: 'ID_CARD' | 'PASSPORT' | string;
    idNo?: string;
    idCardFront?: string;
    idCardBack?: string;
    holdingPhoto?: string;
    nationality?: string;
    expireAt?: Id;
    status: Status;
    reviewRemark?: string;
    submittedAt?: Id;
    reviewedAt?: Id;
  }

  interface SubmitParams {
    realName: string;
    idType: 'ID_CARD' | 'PASSPORT';
    idNo: string;
    idCardFront: string;
    idCardBack?: string;
    holdingPhoto?: string;
    nationality?: string;
  }
}
