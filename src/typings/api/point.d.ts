declare namespace Api {
  namespace Point {
    interface RuleItem {
      behaviorCode: string;
      name?: string;
      identity?: string;
      identityText?: string;
      unit?: string;
      description?: string;
      score?: string | number;
      dailyCap?: string | number;
      cumulativeCap?: string | number;
      enabled?: boolean;
      appealable?: boolean;
      defaultScore?: string | number;
      defaultDailyCap?: string | number;
      defaultCumulativeCap?: string | number;
      defaultEnabled?: boolean;
      sort?: number;
    }
    interface RealLedgerQuery {
      pageNo?: number;
      pageSize?: number;
      behaviorCode?: string;
    }

    interface RealLedgerDTO {
      id: string | number;
      userId: string | number;
      userNickname?: string;
      behaviorCode: string;
      behaviorName?: string;
      quantity?: number;
      score: string | number;
      balanceAfter: string | number;
      bizNo?: string;
      remark?: string;
      appealable?: boolean;
      appealStatus?: string;
      reversed?: boolean;
      createdAt: string | number;
    }

    interface RealLedgerPage {
      pageNo: number;
      pageSize: number;
      total: number;
      records: RealLedgerDTO[];
    }

    interface RealAppealSubmitParams {
      ledgerId: string;
      reason: string;
    }

    type RealAppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

    interface RealAppealPageQuery {
      pageNo?: number;
      pageSize?: number;
      keyword?: string;
      status?: RealAppealStatus;
      userId?: string | number;
    }

    interface RealAppealDTO {
      id: string | number;
      ledgerId: string | number;
      userId: string | number;
      userNickname?: string;
      behaviorCode?: string;
      behaviorName?: string;
      originalScore?: string | number;
      reason: string;
      status: RealAppealStatus;
      decision?: string;
      reviewComment?: string;
      reviewerId?: string | number;
      createdAt: string | number;
      reviewedAt?: string | number;
    }

    interface RealAppealPage {
      pageNo: number;
      pageSize: number;
      total: number;
      records: RealAppealDTO[];
    }
  }
}
