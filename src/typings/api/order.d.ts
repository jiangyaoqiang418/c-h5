declare namespace Api {
  namespace RealOrder {
    type LongId = string | number;
    type OrderType = 'DIRECT_PURCHASE' | 'PROXY_PURCHASE' | 'DEMAND_FULFILL';
    type OrderStatus = 'CREATED' | 'PAID' | 'SHIPPED' | 'REFUND_REVIEW' | 'REFUNDED' | 'COMPLETED' | 'CANCELED';
    type RefundStatus = 'APPLYING' | 'AGREED' | 'REJECTED' | 'CANCELED';

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

    /**
     * 订单接口 DTO 转换后的页面展示模型。
     *
     * `id` 始终保留服务端的 Long 原值，不允许在页面层转成 number；
     * `status` 仅用于复用当前 C 端状态标签，`rawStatus` 保留后端真实状态。
     */
    interface OrderView {
      id: LongId;
      code: string;
      rawStatus: OrderStatus;
      status: Api.Order.OrderStatus;
      productId?: LongId;
      productTitle: string;
      productCover?: string;
      counterpartLabel: '买手' | '顾客';
      counterpartName: string;
      price: string | number;
      shippingFee: string | number;
      tax: string | number;
      totalAmount: string | number;
      shippingAddress: string;
      receiverName: string;
      receiverPhone: string;
      createdAt?: string | number;
      paidAt?: string | number;
      shippedAt?: string | number;
      completedAt?: string | number;
      canceledAt?: string | number;
      cancelReason?: string;
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

    interface OrderGroupPayParams {
      orderGroupNo: string;
    }

    interface OrderShipParams {
      id: LongId;
      logisticsCompany: string;
      logisticsCompanyCode?: string;
      trackingNo: string;
      shipVouchers?: string[];
      remark?: string;
    }

    interface OrderRefundApplyParams {
      orderId: LongId;
      reason: string;
      evidenceImages?: string[];
    }

    interface OrderRefundPageQuery {
      pageNo?: number;
      pageSize?: number;
      orderNo?: string;
      status?: RefundStatus;
    }

    interface OrderRefundDTO {
      refundId: LongId;
      orderId: LongId;
      orderNo?: string;
      orderStatus?: OrderStatus;
      buyerName?: string;
      sellerName?: string;
      productTitle?: string;
      productImage?: string;
      amount?: string | number;
      reason?: string;
      evidenceImages?: string[];
      status: RefundStatus;
      statusText?: string;
      orderStatusBefore?: OrderStatus;
      reviewRemark?: string;
      refundBizNo?: string;
      appliedAt?: string | number;
      reviewedAt?: string | number;
      canceledAt?: string | number;
    }

    interface OrderRefundPage {
      pageNo?: number;
      pageSize?: number;
      total: number;
      records: OrderRefundDTO[];
    }

    interface OrderCancelParams {
      id: LongId;
      reason: string;
    }
  }
}
