declare namespace Api {
  namespace RealUser {
    type BuyerApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

    interface BuyerApplicationDTO {
      id: string | number;
      userId: string | number;
      realName?: string;
      contact?: string;
      reason?: string;
      status: BuyerApplicationStatus;
      reviewRemark?: string;
      reviewerId?: string | number;
      appliedAt?: string | number;
      reviewedAt?: string | number;
    }
  }
}
