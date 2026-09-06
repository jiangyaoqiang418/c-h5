/**
 * 包装 uni.setStorageSync / getStorageSync — 跨端通用（H5 / 小程序）。
 * H5 内 uni.setStorageSync 实际就是 window.localStorage 的同步 wrapper。
 */

/** 操作回执的空值只有在键确实不存在时才算缺失；普通业务值不使用此判定。 */
export function isMissingOperationRecord(key: string, value: unknown): boolean {
  if (value != null && value !== '' && value !== false && value !== 0) return false;
  const info = uni.getStorageInfoSync();
  if (!Array.isArray(info?.keys) || info.keys.includes(key)) throw new Error('本机操作记录读取失败，请先核对原记录，不要重复提交');
  return true;
}

export const storage = {
  set(key: string, value: unknown): void {
    try {
      uni.setStorageSync(key, value);
    } catch {
      /* noop */
    }
  },
  get<T = unknown>(key: string, fallback?: T): T {
    try {
      const v = uni.getStorageSync(key);
      return v == null || v === '' ? (fallback as T) : (v as T);
    } catch {
      return fallback as T;
    }
  },
  remove(key: string): void {
    try {
      uni.removeStorageSync(key);
    } catch {
      /* noop */
    }
  }
};
