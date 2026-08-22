import { clearAccessToken, realUserRequest, setAccessToken } from '../request';
import { fetchPointAccount, type PointAccount } from './point';

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

function toUserRecord(profile: CurrentUserResponse, account: PointAccount): Api.User.UserRecord {
  const isBuyer = profile.roles?.some(role => role.toUpperCase() === 'BUYER') || false;
  const roleInfo = isBuyer ? account.buyer : account.customer;

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
    points: Number(account.points ?? profile.points ?? 0),
    vipLevel: roleInfo?.level === 'VIP1' || roleInfo?.level === 'VIP2' ? roleInfo.level : 'VIP0',
    tagIds: [],
    registeredAt: ''
  };
}

export async function fetchCurrentUser(): Promise<Api.User.UserRecord> {
  const [profile, account] = await Promise.all([
    realUserRequest<CurrentUserResponse>({ url: '/auth/me' }),
    fetchPointAccount()
  ]);
  return toUserRecord(profile, account);
}

export async function login(params: LoginParams): Promise<Api.User.UserRecord> {
  const loginResult = await realUserRequest<LoginResponse, LoginParams>({
    url: '/auth/login',
    method: 'POST',
    data: params,
    requireToken: false
  });
  setAccessToken(loginResult.token);
  try {
    return await fetchCurrentUser();
  } catch (error) {
    clearAccessToken();
    throw error;
  }
}

export function logoutLocal(): void {
  clearAccessToken();
}
