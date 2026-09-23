export interface WalletTransferProgress { started: true; txHash?: string; fromAddress?: string }
const keyFor = (userId: string, payNo: string) => `bw_h5_wallet_transfer_v1:${encodeURIComponent(userId)}:${encodeURIComponent(payNo)}`;

export function readWalletTransferProgress(userId: string, payNo: string): WalletTransferProgress | undefined {
  const value = uni.getStorageSync(keyFor(userId, payNo));
  if (value == null || value === '') return;
  if (typeof value !== 'object' || value.started !== true
    || (value.txHash !== undefined && (typeof value.txHash !== 'string' || !value.txHash))
    || (value.fromAddress !== undefined && (typeof value.fromAddress !== 'string' || !value.fromAddress))) {
    throw new Error('本机转账记录无法读取，请先核对钱包交易，暂不可再次转账');
  }
  return value as WalletTransferProgress;
}

export function saveWalletTransferProgress(userId: string, payNo: string, value: WalletTransferProgress) {
  const key = keyFor(userId, payNo);
  uni.setStorageSync(key, value);
  if (JSON.stringify(readWalletTransferProgress(userId, payNo)) !== JSON.stringify(value)) {
    throw new Error('本机转账记录无法保存，已停止钱包签名');
  }
}

export function clearWalletTransferProgress(userId: string, payNo: string) {
  uni.removeStorageSync(keyFor(userId, payNo));
}
