import { clearAccessToken, getAccessToken, realUserRequest, setAccessToken } from '../request';

export type CurrentUser = Omit<Api.User.UserRecord, 'email' | 'points' | 'vipLevel'> & {
  email: string | null;
  points?: number;
  loginPasswordSet?: boolean;
};

export interface LoginParams {
  email: string;
  password: string;
}

interface LoginResponse {
  userId: string;
  token: string;
  nickname: string;
  avatar?: string;
  newUser?: boolean;
  loginPasswordSet?: boolean;
  payPasswordSet?: boolean;
}

export interface OAuthConfig {
  googleEnabled: boolean;
  googleClientId: string | null;
  googleOneTapEnabled: boolean;
  telegramEnabled: boolean;
  telegramBotUsername: string | null;
}

export type OAuthLoginParams =
  | { provider: 'GOOGLE'; credential: string }
  | { provider: 'TELEGRAM'; telegramPayload: Record<string, string> };

export interface LoginReceipt {
  profile: CurrentUser;
  token: string;
  newUser: boolean;
  loginPasswordSet: boolean;
  payPasswordSet: boolean;
}

interface CurrentUserResponse {
  userId: string;
  email: string | null;
  nickname: string;
  avatar?: string;
  phone?: string;
  points?: string | number;
  roles?: string[];
  kycStatus?: string;
  loginPasswordSet?: boolean;
}

function normalizeKycStatus(status?: string): Api.User.KycStatus {
  const value = status?.toLowerCase();
  if (value === 'approved' || value === 'passed') return 'approved';
  if (value === 'pending') return 'pending';
  if (value === 'rejected') return 'rejected';
  if (value === 'expired') return 'expired';
  return 'none';
}

function toUserRecord(profile: CurrentUserResponse): CurrentUser {
  const isBuyer = profile.roles?.some(role => role.toUpperCase() === 'BUYER') || false;

  return {
    // `id` 仅保留给尚未迁移的 Mock 页面兼容使用；真实业务 ID 只能使用 remoteId。
    id: 0,
    remoteId: profile.userId,
    email: profile.email ?? null,
    nickname: profile.nickname || '',
    avatar: profile.avatar,
    phone: profile.phone,
    isBuyer,
    kycStatus: normalizeKycStatus(profile.kycStatus),
    status: '1',
    points: profile.points == null ? undefined : Number(profile.points),
    tagIds: [],
    registeredAt: '',
    loginPasswordSet: profile.loginPasswordSet
  };
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  // 基础身份不依赖积分/VIP服务；各业务页面独立读取自己的账户数据。
  const profile = await realUserRequest<CurrentUserResponse>({ url: '/auth/me' });
  return toUserRecord(profile);
}

async function completeLogin(loginResult: LoginResponse, previousToken: string, accept: () => boolean): Promise<LoginReceipt> {
  if (!accept() || previousToken !== getAccessToken()) throw new Error('登录操作已失效，请重新登录');
  setAccessToken(loginResult.token);
  const profile = await fetchCurrentUser();
  profile.loginPasswordSet ??= loginResult.loginPasswordSet;
  return {
    profile,
    token: loginResult.token,
    newUser: !!loginResult.newUser,
    loginPasswordSet: profile.loginPasswordSet ?? true,
    payPasswordSet: !!loginResult.payPasswordSet
  };
}

export async function login(params: LoginParams, accept: () => boolean = () => true): Promise<LoginReceipt> {
  const previousToken = getAccessToken();
  const loginResult = await realUserRequest<LoginResponse, LoginParams>({
    url: '/auth/login',
    method: 'POST',
    data: params,
    requireToken: false
  });
  return completeLogin(loginResult, previousToken, accept);
}

export const fetchOAuthConfig = () => realUserRequest<OAuthConfig>({ url: '/auth/oauth/config', requireToken: false });

export async function oauthLogin(params: OAuthLoginParams, accept: () => boolean = () => true): Promise<LoginReceipt> {
  const previousToken = getAccessToken();
  const result = await realUserRequest<LoginResponse, OAuthLoginParams>({
    url: '/auth/oauth/login', method: 'POST', data: params, requireToken: false
  });
  return completeLogin(result, previousToken, accept);
}

export interface SetLoginPasswordParams { email?: string; password: string; confirmPassword: string }
export const setLoginPassword = (data: SetLoginPasswordParams) => realUserRequest<void, SetLoginPasswordParams>({
  url: '/auth/password/set', method: 'POST', data
});

export function logoutLocal(): void {
  clearAccessToken();
}
