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

const bucketMap: Record<string, keyof Api.Wallet.InternalAccount> = {
  AVAILABLE: 'available',
  NON_WITHDRAWABLE: 'nonWithdrawable',
  LOCKED_FINANCE: 'lockedFinance',
  FROZEN_ORDER: 'frozenOrder',
  FROZEN_RISK: 'frozenRisk',
  DEPOSIT_AVAILABLE: 'depositAvailable',
  DEPOSIT_GUARANTEED: 'depositGuaranteed'
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

export function createWithdraw(params: WithdrawParams): Promise<string | number> {
  return realUserRequest<string | number, WithdrawParams>({ url: '/withdraw/create', method: 'POST', data: params });
}
