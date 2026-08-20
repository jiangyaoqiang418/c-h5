declare namespace Api {
  namespace RealWallet {
    type RechargeStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED';
    type WithdrawStatus = 'REVIEWING' | 'APPROVED' | 'SUCCESS' | 'REJECTED';

    interface WalletLedgerPageQuery {
      pageNo?: number;
      pageSize?: number;
      bizGroup?: string;
      bizType?: string;
    }

    interface WalletLedgerDTO {
      id: string | number;
      userId: string | number;
      bizType: string;
      bizTypeText?: string;
      bizGroup?: string;
      bizGroupText?: string;
      fromType?: string;
      toType?: string;
      amount: string | number;
      fromBalanceAfter?: string | number;
      toBalanceAfter?: string | number;
      remark?: string;
      createdAt: string | number;
    }

    interface WalletLedgerPage {
      pageNo?: number;
      pageSize?: number;
      current?: number;
      size?: number;
      total: number;
      records: WalletLedgerDTO[];
    }

    interface RechargeVO {
      id: string | number;
      chain: string;
      chainLabel?: string;
      amount: string | number;
      depositAddress?: string;
      memo?: string;
      txHash?: string;
      status: RechargeStatus;
      statusText?: string;
      confirmedAt?: string | number;
      createdAt?: string | number;
    }

    interface RechargeAddressVO {
      chain: string;
      address: string;
      tokenContract?: string;
      decimals?: number;
      memo?: string;
      minAmount?: string | number;
      minConfirmations?: number;
    }

    interface RechargeChainVO {
      chain: string;
      label?: string;
      decimals?: number;
      depositAddress?: string;
      minAmount?: string | number;
      enabled?: boolean;
    }

    interface RechargePage {
      pageNo?: number;
      pageSize?: number;
      total: number;
      records: RechargeVO[];
    }

    interface WithdrawVO {
      id: string | number;
      chain: string;
      toAddress?: string;
      amount: string | number;
      fee?: string | number;
      actualAmount?: string | number;
      txHash?: string;
      status: WithdrawStatus;
      statusText?: string;
      reviewComment?: string;
      failReason?: string;
      payoutId?: string | number;
      payoutStatus?: string;
      dispatchedAt?: string | number;
      submittedAt?: string | number;
      blockHeight?: string | number;
      networkFee?: string | number;
      networkFeeSymbol?: string;
      paidAt?: string | number;
      confirmedAt?: string | number;
      createdAt?: string | number;
    }

    interface WithdrawPage {
      pageNo?: number;
      pageSize?: number;
      total: number;
      records: WithdrawVO[];
    }
  }
}
