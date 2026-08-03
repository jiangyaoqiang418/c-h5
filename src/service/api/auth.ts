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

function toLegacyDisplayId(id: string): number {
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function toUserRecord(profile: CurrentUserResponse, account: PointAccount): Api.User.UserRecord {
  const isBuyer = profile.roles?.some(role => role.toUpperCase() === 'BUYER') || false;
  const roleInfo = isBuyer ? account.buyer : account.customer;

  return {
    id: toLegacyDisplayId(profile.userId),
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
