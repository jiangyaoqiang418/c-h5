declare namespace Api {
  namespace RealPurchase {
    type AfterSaleType = 'SEVEN_DAY_NO_REASON' | 'NONE' | 'SHOP_WARRANTY' | 'NATIONAL_WARRANTY';

    interface PurchaseDemandPageQuery {
      pageNo?: number;
      pageSize?: number;
      categoryId?: string | number;
      keyword?: string;
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
      expireAt?: string | number;
      takenBy?: string | number;
      takenAt?: string | number;
      orderId?: string | number;
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
      images?: ProductImageParam[];
    }
  }
}
