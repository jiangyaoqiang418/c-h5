declare namespace Api {
  namespace RealUser {
    type BuyerApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

    interface BuyerApplyParams {
      realName: string;
      contact: string;
      reason: string;
    }

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

    type BuyerDepositBizType = 'PAY' | 'REFUND' | 'DEDUCT' | 'FREEZE' | 'UNFREEZE';

    interface BuyerDepositLedgerQuery {
      pageNo?: number;
      pageSize?: number;
      bizType?: BuyerDepositBizType;
    }

    interface BuyerDepositLedgerDTO {
      id: string | number;
      buyerId: string | number;
      userId: string | number;
      bizType: BuyerDepositBizType;
      amount: string | number;
      balanceAfter: string | number;
      bizNo?: string;
      remark?: string;
      createdAt: string | number;
    }

    interface BuyerDepositLedgerPage {
      pageNo?: number;
      pageSize?: number;
      total: number;
      records: BuyerDepositLedgerDTO[];
    }

    interface BuyerDepositParams {
      amount: number;
      idempotencyKey: string;
    }
  }
}
