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

export const realServiceConfig: RealServiceConfig = {
  user: env.VITE_REAL_USER_BASE_URL || '',
  order: env.VITE_REAL_ORDER_BASE_URL || '',
  admin: env.VITE_REAL_ADMIN_BASE_URL || '',
  successCode: env.VITE_REAL_SERVICE_SUCCESS_CODE || '1',
  logoutCodes: splitCodes(env.VITE_REAL_SERVICE_LOGOUT_CODES, ['-200']),
  modalLogoutCodes: splitCodes(env.VITE_REAL_SERVICE_MODAL_LOGOUT_CODES, ['-201'])
};
