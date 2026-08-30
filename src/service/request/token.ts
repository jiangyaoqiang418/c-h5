const ACCESS_TOKEN_KEY = 'youbao.access-token';
const sessionListeners = new Set<() => void>();

export function onSessionChanged(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function getAccessToken(): string {
  return uni.getStorageSync(ACCESS_TOKEN_KEY) || '';
}

export function setAccessToken(token: string): void {
  const previous = getAccessToken();
  uni.setStorageSync(ACCESS_TOKEN_KEY, token);
  if (previous !== token) sessionListeners.forEach(listener => listener());
}

export function clearAccessToken(): void {
  uni.removeStorageSync(ACCESS_TOKEN_KEY);
  sessionListeners.forEach(listener => listener());
}
