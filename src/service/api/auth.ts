import { clearAccessToken, getAccessToken, realUserRequest, setAccessToken } from '../request';

export type CurrentUser = Omit<Api.User.UserRecord, 'points' | 'vipLevel'> & { points?: number };

export interface LoginParams {
  email: string;
  password: string;
}

interface LoginResponse {
  userId: string;
  token: string;
  nickname: string;
  avatar?: string;
}

interface CurrentUserResponse {
  userId: string;
  email: string;
  nickname: string;
  avatar?: string;
  phone?: string;
  points?: string | number;
  roles?: string[];
  kycStatus?: string;
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
    email: profile.email || '',
    nickname: profile.nickname || '',
    avatar: profile.avatar,
    phone: profile.phone,
    isBuyer,
    kycStatus: normalizeKycStatus(profile.kycStatus),
    status: '1',
    points: profile.points == null ? undefined : Number(profile.points),
    tagIds: [],
    registeredAt: ''
  };
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  // 基础身份不依赖积分/VIP服务；各业务页面独立读取自己的账户数据。
  const profile = await realUserRequest<CurrentUserResponse>({ url: '/auth/me' });
  return toUserRecord(profile);
}

export async function login(params: LoginParams, accept: () => boolean = () => true): Promise<{ profile: CurrentUser; token: string }> {
  const previousToken = getAccessToken();
  const loginResult = await realUserRequest<LoginResponse, LoginParams>({
    url: '/auth/login',
    method: 'POST',
    data: params,
    requireToken: false
  });
  if (!accept() || previousToken !== getAccessToken()) throw new Error('登录操作已失效，请重新登录');
  setAccessToken(loginResult.token);
  // 登录后的资料请求断网不等于凭据失效，真正的 401 由请求层统一处理。
  const profile = await fetchCurrentUser();
  return { profile, token: loginResult.token };
}

export function logoutLocal(): void {
  clearAccessToken();
}
