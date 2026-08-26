declare namespace Api.RealKyc {
  type Id = string | number;
  type Status = 'PENDING' | 'PASSED' | 'REJECTED';

  interface DetailVO {
    id: Id;
    realName?: string;
    idType?: 'ID_CARD' | 'PASSPORT' | string;
    idNo?: string;
    idCardFront?: string;
    idCardFrontFileId?: Id;
    idCardBack?: string;
    idCardBackFileId?: Id;
    holdingPhoto?: string;
    holdingPhotoFileId?: Id;
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
    idCardFrontFileId: Id;
    idCardBackFileId?: Id;
    holdingPhotoFileId?: Id;
    nationality?: string;
  }

  interface FileUploadResult {
    id: Id;
    scene?: string;
    url: string;
    privateAccess?: boolean;
    expireAt?: Id;
    originalName?: string;
    contentType?: string;
    size?: Id;
  }

  interface FileAccessResult {
    fileId: Id;
    scene?: string;
    url: string;
    privateAccess?: boolean;
    expireAt?: Id;
    expireSeconds?: number;
  }
}
