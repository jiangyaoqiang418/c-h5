import { realUserRequest } from '../request';

interface WalletBucket {
  type: string;
  amount: string | number;
}

interface WalletOverviewResponse {
  total: string | number;
  currency?: string;
  todayIn?: string | number;
  todayOut?: string | number;
  distribution?: WalletBucket[];
}

export interface WithdrawParams {
  chain: 'TRON' | 'ETH' | 'BSC';
  toAddress: string;
  amount: number;
}

export interface RechargeParams {
  chain: 'TRON' | 'ETH' | 'BSC';
  amount: number;
}

export interface WalletTxnView extends Omit<Api.Wallet.Txn, 'id' | 'userId'> {
  id: string | number;
  userId: string | number;
}

const bucketMap: Record<string, keyof Api.Wallet.InternalAccount> = {
  AVAILABLE: 'available',
  NON_WITHDRAWABLE: 'nonWithdrawable',
  LOCKED_FINANCE: 'lockedFinance',
  FROZEN_ORDER: 'frozenOrder',
  FROZEN_RISK: 'frozenRisk',
  DEPOSIT_AVAILABLE: 'depositAvailable',
  DEPOSIT_GUARANTEED: 'depositGuaranteed'
};

const bucketMapReverse: Record<string, Api.Wallet.Bucket> = {
  AVAILABLE: 'available',
  NON_WITHDRAWABLE: 'nonWithdrawable',
  LOCKED_FINANCE: 'lockedFinance',
  FROZEN_ORDER: 'frozenOrder',
  FROZEN_RISK: 'frozenRisk',
  DEPOSIT_AVAILABLE: 'depositAvailable',
  DEPOSIT_GUARANTEED: 'depositGuaranteed'
};

const txnTypeMap: Record<string, Api.Wallet.TxnType> = {
  RECHARGE: 'DEPOSIT_IN',
  RECHARGE_IN: 'DEPOSIT_IN',
  WITHDRAW: 'WITHDRAW_OUT',
  WITHDRAW_OUT: 'WITHDRAW_OUT',
  ORDER_PAY: 'ORDER_FREEZE',
  ORDER_FREEZE: 'ORDER_FREEZE',
  ORDER_SETTLE: 'ORDER_SETTLE',
  REFUND: 'INTERNAL_REFUND',
  DEPOSIT_PAY: 'DEPOSIT_PLEDGE',
  DEPOSIT_PLEDGE: 'DEPOSIT_PLEDGE',
  DEPOSIT_RELEASE: 'DEPOSIT_RELEASE',
  DEPOSIT_FORFEIT: 'DEPOSIT_FORFEIT',
  FINANCE_LOCK: 'FINANCE_LOCK',
  FINANCE_UNLOCK: 'FINANCE_UNLOCK',
  INTEREST: 'INTEREST_ACCRUE',
  INTEREST_ACCRUE: 'INTEREST_ACCRUE',
  RISK_FREEZE: 'RISK_FREEZE',
  RISK_UNFREEZE: 'RISK_UNFREEZE',
  ADJUST_PLUS: 'ADJUST_PLUS',
  ADJUST_MINUS: 'ADJUST_MINUS',
  FEE: 'FEE_DEDUCT',
  FEE_DEDUCT: 'FEE_DEDUCT'
};

function emptyAccount(): Api.Wallet.InternalAccount {
  return {
    userId: 0,
    userName: '',
    available: '0',
    nonWithdrawable: '0',
    lockedFinance: '0',
    frozenOrder: '0',
    frozenRisk: '0',
    depositAvailable: '0',
    depositGuaranteed: '0',
    interestAccrued: '0',
    payPwdSet: false,
    frozen: false,
    updatedAt: ''
  };
}

export async function fetchWalletOverview() {
  const wallet = await realUserRequest<WalletOverviewResponse>({ url: '/wallet/overview' });
  const account = emptyAccount();
  wallet.distribution?.forEach(bucket => {
    const key = bucketMap[bucket.type];
    if (key && typeof account[key] === 'string') (account as unknown as Record<string, string>)[key] = String(bucket.amount ?? 0);
  });

  return {
    summary: {
      address: '',
      available: account.available,
      nonWithdrawable: account.nonWithdrawable,
      lockedFinance: account.lockedFinance,
      frozenOrder: account.frozenOrder,
      frozenRisk: account.frozenRisk
    } satisfies Api.User.WalletSummary,
    account,
    total: String(wallet.total ?? 0),
    currency: wallet.currency || 'USDT',
    todayIn: String(wallet.todayIn ?? 0),
    todayOut: String(wallet.todayOut ?? 0)
  };
}

function toIso(value: string | number): string {
  if (typeof value === 'number' || /^\d+$/.test(value)) return new Date(Number(value)).toISOString();
  return value;
}

function toTxn(dto: Api.RealWallet.WalletLedgerDTO): WalletTxnView {
  const bucketFrom = dto.fromType ? bucketMapReverse[dto.fromType] : undefined;
  const bucketTo = dto.toType ? bucketMapReverse[dto.toType] : undefined;
  const direction: WalletTxnView['direction'] = bucketTo && !bucketFrom ? 'in' : 'out';
  const type = txnTypeMap[dto.bizType] || txnTypeMap[dto.bizGroup || ''] || (direction === 'in' ? 'ADJUST_PLUS' : 'ADJUST_MINUS');

  return {
    id: dto.id,
    userId: dto.userId,
    userName: '',
    type,
    direction,
    amount: String(dto.amount ?? 0),
    balanceAfter: String(dto.toBalanceAfter ?? dto.fromBalanceAfter ?? 0),
    bucketFrom,
    bucketTo,
    remark: dto.remark || dto.bizTypeText || dto.bizGroupText,
    createdAt: toIso(dto.createdAt)
  };
}

export async function fetchWalletLedger(query: { current?: number; size?: number } = {}) {
  const page = await realUserRequest<Api.RealWallet.WalletLedgerPage, Api.RealWallet.WalletLedgerPageQuery>({
    url: '/wallet/ledger/page',
    method: 'POST',
    data: {
      pageNo: query.current || 1,
      pageSize: query.size || 20
    }
  });
  return {
    current: page.current || page.pageNo || query.current || 1,
    size: page.size || page.pageSize || query.size || 20,
    total: page.total,
    records: page.records.map(toTxn)
  };
}

export function createWithdraw(params: WithdrawParams): Promise<string | number> {
  return realUserRequest<string | number, WithdrawParams>({ url: '/withdraw/create', method: 'POST', data: params });
}

export function createRecharge(params: RechargeParams): Promise<string | number> {
  return realUserRequest<string | number, RechargeParams>({ url: '/recharge/create', method: 'POST', data: params });
}

export function fetchRechargePage(query: { pageNo?: number; pageSize?: number; status?: string } = {}) {
  return realUserRequest<Api.RealWallet.RechargePage, typeof query>({
    url: '/recharge/page',
    method: 'POST',
    data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 50, status: query.status }
  });
}

export function fetchRechargeDetail(id: string | number) {
  return realUserRequest<Api.RealWallet.RechargeVO>({ url: '/recharge/detail', params: { id } });
}

export function fetchWithdrawPage(query: { pageNo?: number; pageSize?: number; status?: string } = {}) {
  return realUserRequest<Api.RealWallet.WithdrawPage, typeof query>({
    url: '/withdraw/page',
    method: 'POST',
    data: { pageNo: query.pageNo || 1, pageSize: query.pageSize || 50, status: query.status }
  });
}

export function fetchWithdrawDetail(id: string | number) {
  return realUserRequest<Api.RealWallet.WithdrawVO>({ url: '/withdraw/detail', params: { id } });
}
