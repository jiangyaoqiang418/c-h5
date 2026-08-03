import { realUserRequest } from '../request';

export interface VipRoleInfo {
  role: string;
  level: string;
  threshold?: string | number;
  nextLevel?: string;
  nextThreshold?: string | number;
}

export interface PointAccount {
  userId: string;
  points: string | number;
  customer?: VipRoleInfo;
  buyer?: VipRoleInfo;
}

export function fetchPointAccount(): Promise<PointAccount> {
  return realUserRequest<PointAccount>({ url: '/points/account' });
}
