import { clearAccessToken, getAccessToken } from './token';
import { RequestError, type RequestOptions, type ServiceEnvelope } from './type';
import { realServiceConfig } from '../config';

const DEFAULT_TIMEOUT = 15_000;
let loginRedirecting = false;

function appendParams(url: string, params?: RequestOptions['params']): string {
  if (!params) return url;
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null);
  if (!entries.length) return url;
  const query = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

function isEnvelope(value: unknown): value is ServiceEnvelope<unknown> {
  return !!value && typeof value === 'object' && ('data' in value || 'success' in value || 'code' in value);
}

function isAllowedServiceURL(baseURL: string): boolean {
  if (/^https:\/\//.test(baseURL)) return true;
  // #ifdef H5
  // H5 开发阶段允许 HTTP 测试服务或 Vite 同源代理；App 产物会移除此分支。
  return /^http:\/\//.test(baseURL) || /^\//.test(baseURL);
  // #endif
  return false;
}

function notifyLoginExpired(): void {
  clearAccessToken();
  if (loginRedirecting) return;
  loginRedirecting = true;
  uni.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/auth/login' });
    loginRedirecting = false;
  }, 300);
}

function throwBusinessError(body: ServiceEnvelope<unknown>): never {
  const code = body.code === undefined || body.code === null ? '' : String(body.code);
  const message = body.message || body.msg || '业务请求失败';
  if (realServiceConfig.logoutCodes.includes(code) || realServiceConfig.modalLogoutCodes.includes(code)) {
    notifyLoginExpired();
    throw new RequestError({ kind: 'unauthorized', message, code: body.code });
  }
  throw new RequestError({ kind: 'business', message, code: body.code });
}

export function createRequest(baseURL: string) {
  return async function request<T, TData = unknown>(options: RequestOptions<TData>): Promise<T> {
    if (!baseURL || !isAllowedServiceURL(baseURL)) {
      throw new RequestError({ kind: 'config', message: '真实服务地址未配置，或当前端不允许使用 HTTP 地址' });
    }

    const token = options.requireToken === false ? '' : getAccessToken();
    const header: Record<string, string> = {
      'content-type': 'application/json',
      ...options.header
    };
    if (token) header['X-Access-Token'] = token;

    let response: UniApp.RequestSuccessCallbackResult;
    try {
      response = await uni.request({
        url: appendParams(`${baseURL.replace(/\/$/, '')}/${options.url.replace(/^\//, '')}`, options.params),
        method: options.method || 'GET',
        data: options.data as UniApp.RequestOptions['data'],
        header,
        timeout: options.timeout || DEFAULT_TIMEOUT
      });
    } catch (error) {
      throw new RequestError({
        kind: 'network',
        message: error instanceof Error ? error.message : '网络请求失败'
      });
    }

    if (response.statusCode === 401) {
      notifyLoginExpired();
      throw new RequestError({ kind: 'unauthorized', message: '登录已失效', statusCode: response.statusCode });
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new RequestError({ kind: 'http', message: `请求失败（${response.statusCode}）`, statusCode: response.statusCode });
    }

    const body = response.data;
    if (!isEnvelope(body)) return body as T;
    const code = body.code === undefined || body.code === null ? '' : String(body.code);
    if ((code && code !== realServiceConfig.successCode) || body.success === false) {
      throwBusinessError(body);
    }
    return body.data as T;
  };
}

export const realAdminRequest = createRequest(realServiceConfig.admin);
export const realUserRequest = createRequest(realServiceConfig.user);
export const realOrderRequest = createRequest(realServiceConfig.order);

export { clearAccessToken, getAccessToken, setAccessToken } from './token';
export { RequestError } from './type';
export type { RequestOptions, ServiceEnvelope } from './type';
