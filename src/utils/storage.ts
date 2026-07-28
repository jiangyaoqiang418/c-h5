/**
 * 包装 uni.setStorageSync / getStorageSync — 跨端通用（H5 / 小程序）。
 * H5 内 uni.setStorageSync 实际就是 window.localStorage 的同步 wrapper。
 */

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
