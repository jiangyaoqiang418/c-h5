import { clearAccessToken, getAccessToken } from './token';
import { RequestError, type RequestOptions, type ServiceEnvelope, type UploadOptions } from './type';
import { realServiceConfig } from '../config';

const DEFAULT_TIMEOUT = 15_000;
let loginRedirecting = false;

// 只保留各页面实际消费的业务参数，不把凭据或任意查询参数带入登录地址。
const LOGIN_RETURN_PARAMS: Record<string, readonly string[]> = {
  '/pages/product/detail': ['id', 'source'],
  '/pages/product/list': ['keyword', 'categoryId', 'sort'],
  '/pages/buyer/product-detail': ['id'],
  '/pages/order/detail': ['id'],
  '/pages/order/list': ['status'],
  '/pages/checkout/index': ['mode', 'contextId', 'guestTransferId'],
  '/pages/checkout/success': ['orderId', 'orderIds'],
  '/pages/purchase/create': ['productHint', 'categoryId'],
  '/pages/purchase/detail': ['id'],
  '/pages/aftersale/create': ['orderId'],
  '/pages/aftersale/detail': ['id'],
  '/pages/review/write': ['orderId'],
  '/pages/finance/detail': ['id'],
  '/pages/wallet/recharge-detail': ['id'],
  '/pages/wallet/withdraw-detail': ['id'],
  '/pages/my/addresses': ['mode', 'selectedId'],
  '/pages/message/notifications': ['category'],
  '/pages/im/real-order-group': ['orderId'],
  '/pages/im/order-group': ['orderCode']
};

export function loginReturnUrl(page?: { route?: string; options?: Record<string, unknown> }): string {
  const path = page?.route ? `/${page.route.replace(/^\//, '')}` : '/pages/my/index';
  if (!/^\/pages\/[a-z0-9/-]+$/i.test(path) || path.startsWith('/pages/auth/')) return '/pages/my/index';
  const query = (LOGIN_RETURN_PARAMS[path] || []).flatMap(key => {
    const value = page?.options?.[key];
    return typeof value === 'string' && value ? [`${key}=${encodeURIComponent(value)}`] : [];
  }).join('&');
  return path + (query ? `?${query}` : '');
}

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

export function notifyLoginExpired(token: string): void {
  if (!token || token !== getAccessToken()) return;
  clearAccessToken();
  if (loginRedirecting) return;
  loginRedirecting = true;
  uni.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
  setTimeout(() => {
    if (getAccessToken()) { loginRedirecting = false; return; }
    const page = getCurrentPages().slice(-1)[0] as { route?: string; options?: Record<string, string> } | undefined;
    if (page?.route?.replace(/^\//, '') !== 'pages/auth/login') {
      uni.reLaunch({ url: `/pages/auth/login?redirect=${encodeURIComponent(loginReturnUrl(page))}` });
    }
    loginRedirecting = false;
  }, 300);
}

function throwBusinessError(body: ServiceEnvelope<unknown>, token: string): never {
  const code = body.code === undefined || body.code === null ? '' : String(body.code);
  const message = body.message || body.msg || '业务请求失败';
  if (realServiceConfig.logoutCodes.includes(code) || realServiceConfig.modalLogoutCodes.includes(code)) {
    notifyLoginExpired(token);
    throw new RequestError({ kind: 'unauthorized', message, code: body.code });
  }
  throw new RequestError({ kind: 'business', message, code: body.code });
}

function unwrapBody<T>(body: unknown, token: string): T {
  if (!isEnvelope(body)) return body as T;
  const code = body.code === undefined || body.code === null ? '' : String(body.code);
  if ((code && code !== realServiceConfig.successCode) || body.success === false) {
    throwBusinessError(body, token);
  }
  return body.data as T;
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

    if (token && token !== getAccessToken()) {
      throw new RequestError({ kind: 'unauthorized', message: '会话已切换，本次响应已忽略' });
    }
    if (response.statusCode === 401) {
      notifyLoginExpired(token);
      throw new RequestError({ kind: 'unauthorized', message: '登录已失效', statusCode: response.statusCode });
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new RequestError({ kind: 'http', message: `请求失败（${response.statusCode}）`, statusCode: response.statusCode });
    }

    return unwrapBody<T>(response.data, token);
  };
}

export function createUpload(baseURL: string) {
  return async function upload<T>(options: UploadOptions): Promise<T> {
    if (!baseURL || !isAllowedServiceURL(baseURL)) {
      throw new RequestError({ kind: 'config', message: '真实服务地址未配置，或当前端不允许使用 HTTP 地址' });
    }

    const token = options.requireToken === false ? '' : getAccessToken();
    const header: Record<string, string> = { ...options.header };
    if (token) header['X-Access-Token'] = token;

    let response: { statusCode: number; data: string };
    try {
      response = await new Promise((resolve, reject) => {
        uni.uploadFile({
          url: appendParams(`${baseURL.replace(/\/$/, '')}/${options.url.replace(/^\//, '')}`, options.params),
          filePath: options.filePath,
          name: options.name,
          formData: options.formData,
          header,
          timeout: options.timeout || DEFAULT_TIMEOUT,
          success: resolve,
          fail: reject
        });
      });
    } catch (error) {
      throw new RequestError({
        kind: 'network',
        message: error instanceof Error ? error.message : '文件上传失败'
      });
    }

    if (token && token !== getAccessToken()) {
      throw new RequestError({ kind: 'unauthorized', message: '会话已切换，本次上传响应已忽略' });
    }
    if (response.statusCode === 401) {
      notifyLoginExpired(token);
      throw new RequestError({ kind: 'unauthorized', message: '登录已失效', statusCode: response.statusCode });
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new RequestError({ kind: 'http', message: `上传失败（${response.statusCode}）`, statusCode: response.statusCode });
    }

    let body: unknown;
    try {
      body = JSON.parse(response.data);
    } catch {
      body = response.data;
    }
    return unwrapBody<T>(body, token);
  };
}

export const realAdminRequest = createRequest(realServiceConfig.admin);
export const realUserRequest = createRequest(realServiceConfig.user);
export const realOrderRequest = createRequest(realServiceConfig.order);
export const realNotifyRequest = createRequest(realServiceConfig.notify);
export const realOrderUpload = createUpload(realServiceConfig.order);
export const realUserUpload = createUpload(realServiceConfig.user);
export const realNotifyUpload = createUpload(realServiceConfig.notify);

export { clearAccessToken, getAccessToken, setAccessToken } from './token';
export { RequestError } from './type';
export type { RequestOptions, ServiceEnvelope, UploadOptions } from './type';
