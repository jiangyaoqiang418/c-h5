interface RealServiceConfig {
  user: string;
  order: string;
  admin: string;
  successCode: string;
  logoutCodes: string[];
  modalLogoutCodes: string[];
}

const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});

function splitCodes(value: string | undefined, fallback: string[]): string[] {
  return value ? value.split(',').map(code => code.trim()).filter(Boolean) : fallback;
}

function resolveServiceURL(baseURL: string | undefined, targetURL: string | undefined): string {
  const resolvedBaseURL = baseURL || '';
  // #ifdef APP-PLUS
  // HBuilderX 真机运行固定加载 development 环境；App 不能使用 H5 的 /api 代理地址。
  if (!/^https:\/\//.test(resolvedBaseURL)) return targetURL || '';
  // #endif
  return resolvedBaseURL;
}

export const realServiceConfig: RealServiceConfig = {
  user: resolveServiceURL(env.VITE_REAL_USER_BASE_URL, env.VITE_REAL_USER_TARGET_URL),
  order: resolveServiceURL(env.VITE_REAL_ORDER_BASE_URL, env.VITE_REAL_ORDER_TARGET_URL),
  admin: resolveServiceURL(env.VITE_REAL_ADMIN_BASE_URL, env.VITE_REAL_ADMIN_TARGET_URL),
  successCode: env.VITE_REAL_SERVICE_SUCCESS_CODE || '1',
  logoutCodes: splitCodes(env.VITE_REAL_SERVICE_LOGOUT_CODES, ['-200']),
  modalLogoutCodes: splitCodes(env.VITE_REAL_SERVICE_MODAL_LOGOUT_CODES, ['-201'])
};
