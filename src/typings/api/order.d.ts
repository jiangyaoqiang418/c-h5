declare namespace Api {
  namespace RealOrder {
    type LongId = string | number;
    type OrderType = 'DIRECT_PURCHASE' | 'PROXY_PURCHASE' | 'DEMAND_FULFILL';
    type OrderStatus = 'CREATED' | 'PAID' | 'SHIPPED' | 'REFUND_REVIEW' | 'REFUNDED' | 'COMPLETED' | 'CANCELED';
    type RefundStatus = 'APPLYING' | 'AGREED' | 'REJECTED';

    interface OrderPageQuery {
      pageNo?: number;
      pageSize?: number;
      status?: OrderStatus;
    }

    interface OrderDTO {
      orderId: LongId;
      orderNo?: string;
      orderGroupNo?: string;
      orderType?: OrderType;
      status: OrderStatus;
      statusText?: string;
      customerId?: LongId;
      customerName?: string;
      sellerId?: LongId;
      sellerName?: string;
      productId?: LongId;
      productTitle?: string;
      productImage?: string;
      originalAmount?: string | number;
      totalAmount?: string | number;
      shippingFee?: string | number;
      taxFee?: string | number;
      quantity?: number;
      unitPrice?: string | number;
      addressId?: LongId;
      receiverName?: string;
      receiverPhone?: string;
      country?: string;
      province?: string;
      city?: string;
      district?: string;
      detailAddress?: string;
      postalCode?: string;
      logisticsCompany?: string;
      logisticsCompanyCode?: string;
      trackingNo?: string;
      shipVouchers?: string[];
      shippedRemark?: string;
      cancelReason?: string;
      canceledAt?: string | number;
      canceledBy?: LongId;
      refundId?: LongId;
      refundStatus?: RefundStatus;
      refundAmount?: string | number;
      flashSessionId?: LongId;
      flashItemId?: LongId;
      demandId?: LongId;
      remark?: string;
      paidAt?: string | number;
      shippedAt?: string | number;
      completedAt?: string | number;
      createdAt?: string | number;
    }

    interface OrderPage {
      pageNo?: number;
      pageSize?: number;
      total: number;
      records: OrderDTO[];
    }

    interface OrderCreateItemParams {
      productId: LongId;
      quantity?: number;
      sessionId?: LongId;
    }

    interface OrderCreateBatchParams {
      addressId: LongId;
      items: OrderCreateItemParams[];
      idempotencyKey?: string;
      remark?: string;
    }

    interface OrderGroupVO {
      orderGroupNo: string;
      orderIds: LongId[];
      totalAmount?: string | number;
    }

    interface OrderCancelParams {
      id: LongId;
      reason: string;
    }
  }
}
