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

export interface PointLedgerView {
  id: string;
  behavior: string;
  behaviorName: string;
  change: number;
  balanceAfter: number;
  isAppealable: boolean;
  appealStatus: 'none' | 'pending' | 'approved' | 'rejected';
  createdAt: string | number;
}

export interface PointLedgerPage {
  current: number;
  size: number;
  total: number;
  records: PointLedgerView[];
}

function normalizeAppealStatus(status?: string): PointLedgerView['appealStatus'] {
  const value = status?.toLowerCase();
  if (value === 'pending' || value === 'approved' || value === 'rejected') return value;
  return 'none';
}

function toPointLedgerView(record: Api.Point.RealLedgerDTO): PointLedgerView {
  return {
    id: String(record.id),
    behavior: record.behaviorCode,
    behaviorName: record.behaviorName || record.behaviorCode,
    change: Number(record.score || 0),
    balanceAfter: Number(record.balanceAfter || 0),
    isAppealable: !!record.appealable,
    appealStatus: normalizeAppealStatus(record.appealStatus),
    createdAt: record.createdAt
  };
}

export async function fetchPointLedger(query: Api.Point.RealLedgerQuery = {}): Promise<PointLedgerPage> {
  const page = await realUserRequest<Api.Point.RealLedgerPage, Api.Point.RealLedgerQuery>({
    url: '/points/ledger/page',
    method: 'POST',
    data: query
  });
  return {
    current: page.pageNo,
    size: page.pageSize,
    total: page.total,
    records: page.records.map(toPointLedgerView)
  };
}

export function submitPointAppeal(params: Api.Point.RealAppealSubmitParams): Promise<string | number> {
  return realUserRequest<string | number, Api.Point.RealAppealSubmitParams>({
    url: '/points/appeals/submit',
    method: 'POST',
    data: params
  });
}
