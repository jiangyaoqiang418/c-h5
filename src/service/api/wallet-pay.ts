import { realOrderRequest } from '../request';
import { amountToRaw } from '@/utils/amount';

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
export interface WalletPayChainTx {
  status: 'NOT_FOUND' | 'PENDING' | 'CONFIRMING' | 'CONFIRMED' | 'FAILED';
  confirmations: number;
  minConfirmations: number;
  blockHeight?: string | number | null;
  transferAmount?: string | number | null;
}
export type WalletTransferParams = Pick<WalletPayOrder, 'chain' | 'network' | 'tokenContract' | 'toAddress' | 'rawAmount'>;

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
  fromAddress?: string;
  arrivedAmount?: string | number;
  failReason?: string;
  payResult?: Api.RealOrder.OrderGroupPayResult;
  chainTx?: WalletPayChainTx | null;
}

export function fetchWalletPayChains() {
  return realOrderRequest<WalletPayChain[]>({ url: '/orders/wallet-pay/chains' }).then(chains => {
    if (!Array.isArray(chains) || chains.some(item => !item || [item.chain, item.network, item.tokenContract].some(value => typeof value !== 'string' || !value.trim())
      || !Number.isSafeInteger(item.decimals) || item.decimals < 0 || item.decimals > 36
      || !Number.isSafeInteger(item.minConfirmations) || item.minConfirmations < 0 || typeof item.enabled !== 'boolean')) {
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
  if (!pay || [pay.payNo, pay.chain, pay.network, pay.tokenContract, pay.toAddress].some(value => typeof value !== 'string' || !value.trim())
    || pay.orderGroupNo !== group || typeof pay.rawAmount !== 'string' || !/^\d+$/.test(pay.rawAmount)
    || !['PENDING', 'SUBMITTED', 'SUCCESS', 'FAILED', 'CLOSED'].includes(pay.status)
    || !Number.isSafeInteger(pay.decimals) || pay.decimals < 0 || pay.decimals > 36
    || !Number.isSafeInteger(Number(pay.expireAt)) || Number(pay.expireAt) <= 0
    || !/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(pay.payAmount))) {
    throw new Error('钱包支付单参数不完整，请返回订单核对');
  }
  if (pay.rawAmount.replace(/^0+(?=\d)/, '') !== amountToRaw(pay.payAmount, pay.decimals)) throw new Error('支付单金额与链上转账金额不一致，请核对原订单');
  const tx = pay.chainTx;
  if (tx != null && (typeof tx !== 'object' || !['NOT_FOUND', 'PENDING', 'CONFIRMING', 'CONFIRMED', 'FAILED'].includes(tx.status)
    || !Number.isSafeInteger(tx.confirmations) || tx.confirmations < 0
    || !Number.isSafeInteger(tx.minConfirmations) || tx.minConfirmations < 0
    || tx.transferAmount != null && !/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(tx.transferAmount)))) {
    throw new Error('链上进度响应不完整，请刷新支付单核对');
  }
  return pay;
}
