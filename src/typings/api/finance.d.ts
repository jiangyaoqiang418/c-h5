declare namespace Api.RealFinance {
  type Id = string | number;
  type ProductStatus = 'ON_SALE' | 'OFF_SALE' | 'SOLD_OUT';
  type OrderStatus = 'HOLDING' | 'REDEEMED' | 'SETTLED' | 'CANCELED';
  interface Page<T> { pageNo?: number; pageSize?: number; current?: number; size?: number; total: number; records: T[]; }
  interface ProductVO { id: Id; name: string; code?: string; annualRate: string | number; lockDays: number; minAmount: string | number; maxAmount?: string | number; totalQuota?: string | number; remainingQuota?: string | number; earlyRedeemEnabled?: boolean; earlyRedeemFeeRate?: string | number; status: ProductStatus; statusText?: string; description?: string; sort?: number; }
  interface OrderVO { id: Id; productId: Id; productCode?: string; productName: string; annualRate: string | number; lockDays: number; principal: string | number; expectedInterest: string | number; accruedInterest: string | number; settledInterest?: string | number; redeemFee?: string | number; startAt: Id; maturityAt: Id; redeemedAt?: Id; settledAt?: Id; heldDays?: number; remainingDays?: number; status: OrderStatus; statusText?: string; earlyRedeemEnabled?: boolean; earlyRedeemFeeRate?: string | number; canRedeem?: boolean; redeemableInterest?: string | number; forceRedeemed?: boolean; redeemReason?: string; createdAt?: Id; }
  interface OverviewVO { holdingPrincipal: string | number; totalInterest: string | number; pendingInterest: string | number; expectedInterest: string | number; holdingCount: number; }
  interface OrderPageQuery { pageNo?: number; pageSize?: number; status?: OrderStatus; productId?: Id; }
  interface SubscribeParams { productId: Id; amount: string | number; }
}
