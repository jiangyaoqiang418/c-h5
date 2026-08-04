declare namespace Api {
  namespace RealWallet {
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
  }
}
