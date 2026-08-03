const ACCESS_TOKEN_KEY = 'youbao.access-token';

export function getAccessToken(): string {
  return uni.getStorageSync(ACCESS_TOKEN_KEY) || '';
}

export function setAccessToken(token: string): void {
  uni.setStorageSync(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  uni.removeStorageSync(ACCESS_TOKEN_KEY);
}
