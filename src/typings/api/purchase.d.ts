declare namespace Api {
  namespace RealPurchase {
    type AfterSaleType = 'SEVEN_DAY_NO_REASON' | 'NONE' | 'SHOP_WARRANTY' | 'NATIONAL_WARRANTY';

    interface PurchaseDemandPageQuery {
      pageNo?: number;
      pageSize?: number;
      categoryId?: string | number;
      keyword?: string;
      statuses?: string[];
      minBudget?: number;
      maxBudget?: number;
      minDeliveryDays?: number;
      maxDeliveryDays?: number;
    }

    interface DemandProgress {
      demandId: string | number;
      status: string;
      statusText?: string;
      reviewComment?: string;
      reviewedAt?: number;
      pushBatchCount: number;
      reachedBuyerCount: number;
      lastPushedAt?: number;
      expireAt?: number;
      takenAt?: number;
      orderId?: string | number;
      timeline: Array<{ code: string; name: string; description?: string; occurredAt: number }>;
    }

    interface PurchaseDemandVO {
      id: string | number;
      title: string;
      categoryId: string | number;
      description?: string;
      buyerId?: string | number;
      budget: string | number;
      expectDeliveryDays: number;
      overseasClearance?: boolean;
      afterSaleType?: AfterSaleType;
      afterSaleTypeText?: string;
      demandNote?: string;
      status: string;
      statusText?: string;
      reviewComment?: string;
      reviewedAt?: string | number;
      cancelReason?: string;
      expireAt?: string | number;
      takenBy?: string | number;
      takenAt?: string | number;
      orderId?: string | number;
      addressId?: string | number;
      images?: string[];
      createdAt: string | number;
    }

    interface PurchaseDemandPage {
      pageNo?: number;
      pageSize?: number;
      current?: number;
      size?: number;
      total: number;
      records: PurchaseDemandVO[];
    }

    interface ProductImageParam {
      bucket: string;
      filePath: string;
    }

    interface PurchaseDemandCreateParams {
      title: string;
      categoryId: string | number;
      description?: string;
      budget: number;
      expectDeliveryDays: number;
      overseasClearance: boolean;
      afterSaleType: AfterSaleType;
      demandNote: string;
      addressId: string | number;
      images?: ProductImageParam[];
    }
  }
}
