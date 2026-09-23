import { realOrderRequest } from '../request';

export interface WalletPayChain {
  chain: string;
  label: string;
  network: string;
  tokenContract: string;
  decimals: number;
  minAmount: string | number | null;
  minConfirmations: number;
  enabled: boolean;
}

export type WalletPayStatus = 'PENDING' | 'SUBMITTED' | 'SUCCESS' | 'FAILED' | 'CLOSED';

export interface WalletPayOrder {
  payNo: string;
  orderGroupNo: string;
  chain: string;
  chainLabel: string;
  network: string;
  tokenContract: string;
  decimals: number;
  toAddress: string;
  orderAmount: string | number;
  payAmount: string | number;
  rawAmount: string;
  status: WalletPayStatus;
  statusText: string;
  expireAt: string | number;
  txHash?: string;
  arrivedAmount?: string | number;
  failReason?: string;
  payResult?: Api.RealOrder.OrderGroupPayResult;
}

export function fetchWalletPayChains() {
  return realOrderRequest<WalletPayChain[]>({ url: '/orders/wallet-pay/chains' }).then(chains => {
    if (!Array.isArray(chains) || chains.some(item => !item || !item.chain || !item.network || !item.tokenContract
      || !Number.isSafeInteger(item.decimals) || !Number.isSafeInteger(item.minConfirmations) || typeof item.enabled !== 'boolean')) {
      throw new Error('钱包支付可用链响应不完整');
    }
    return chains;
  });
}

export function createWalletPay(data: { orderGroupNo: string; chain: string; confirmedAmount: string; idempotencyKey: string }) {
  return realOrderRequest<WalletPayOrder, typeof data>({ url: '/orders/wallet-pay/create', method: 'POST', data });
}

export function fetchLatestWalletPay(orderGroupNo: string) {
  return realOrderRequest<WalletPayOrder | null>({ url: '/orders/wallet-pay/latest', params: { orderGroupNo }, requireDataEnvelope: true });
}

export function fetchWalletPayDetail(payNo: string) {
  return realOrderRequest<WalletPayOrder>({ url: '/orders/wallet-pay/detail', params: { payNo }, requireDataEnvelope: true });
}

export function submitWalletPayTx(data: { payNo: string; txHash: string; fromAddress?: string }) {
  return realOrderRequest<WalletPayOrder, typeof data>({ url: '/orders/wallet-pay/submit-tx', method: 'POST', data });
}

export function validateWalletPay(pay: WalletPayOrder | null, group: string): WalletPayOrder {
  if (!pay || !pay.payNo || pay.orderGroupNo !== group || !pay.chain || !pay.network
    || !pay.tokenContract || !pay.toAddress || typeof pay.rawAmount !== 'string' || !/^\d+$/.test(pay.rawAmount)
    || !['PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED', 'CLOSED'].includes(pay.status)
    || !Number.isSafeInteger(Number(pay.expireAt))
    || !/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(pay.payAmount))) {
    throw new Error('钱包支付单参数不完整，请返回订单核对');
  }
  return pay;
}
