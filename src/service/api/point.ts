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

export interface PointRuleView {
  code: string;
  label: string;
  description: string;
  unitLabel: string;
  pointsPerUnit: string | number;
  capDaily: string | number;
  capCumulative: string | number;
  enabled: boolean;
  appealable: boolean;
}

export async function fetchPointRules(): Promise<PointRuleView[]> {
  const records = await realUserRequest<Api.Point.RuleItem[]>({ url: '/points/rules', requireToken: false });
  return records.map(item => ({
    code: item.behaviorCode,
    label: item.name || item.behaviorCode,
    description: item.description || '',
    unitLabel: item.unit || '次',
    pointsPerUnit: item.score ?? 0,
    capDaily: item.dailyCap ?? 0,
    capCumulative: item.cumulativeCap ?? 0,
    enabled: item.enabled !== false,
    appealable: !!item.appealable
  }));
}

export interface VipBenefitView { code: string; name: string; unit?: string; value?: string; }
export interface VipLevelView { level: string; label: string; threshold: string | number; benefits: VipBenefitView[]; }
export interface VipRoleCatalogView { role: string; roleText?: string; currentLevel?: string; levels: VipLevelView[]; }
export interface VipCatalogView { points?: string | number; logged?: boolean; roles: VipRoleCatalogView[]; }

export function fetchVipCatalog(): Promise<VipCatalogView> {
  return realUserRequest<VipCatalogView>({ url: '/points/vip-configs', requireToken: false });
}

const benefitKeys: Record<string, string> = {
  C_RATE_BONUS: 'interestRateBonus',
  C_PURCHASE_CONCURRENCY: 'purchaseConcurrent',
  C_PURCHASE_PRIORITY: 'purchasePriority',
  C_AFTERSALE_RESPONSE: 'aftersaleResponse',
  C_WITHDRAW_FEE_DISCOUNT: 'withdrawFeeDiscount',
  B_PUSH_INTERVAL: 'pushIntervalMinutes',
  B_TRADE_FEE_DISCOUNT: 'transactionFeeDiscount',
  B_PRODUCT_LIMIT: 'productSlotsMax'
};

export async function fetchVipConfigs(): Promise<Api.Vip.LevelConfig[]> {
  const catalog = await fetchVipCatalog();
  return catalog.roles.flatMap(role => {
    const audience: Api.Vip.Audience = role.role.toUpperCase() === 'BUYER' ? 'buyer' : 'customer';
    return role.levels.map(level => {
      const benefits = Object.fromEntries(level.benefits.map(benefit => [benefitKeys[benefit.code] || benefit.code, Number(benefit.value || 0)]));
      return {
        audience,
        level: level.level as Api.Vip.Level,
        label: level.level,
        threshold: Number(level.threshold || 0),
        ...(audience === 'customer' ? { customerBenefits: benefits as unknown as Api.Vip.CustomerBenefits } : { buyerBenefits: benefits as unknown as Api.Vip.BuyerBenefits })
      };
    });
  });
}

export interface PointAppealView {
  id: string;
  ledgerId: string;
  behaviorCode: string;
  behaviorName: string;
  originalScore: number;
  reason: string;
  status: Api.Point.RealAppealStatus;
  reviewComment: string;
  createdAt: string | number;
  reviewedAt?: string | number;
}

export interface PointAppealPage {
  current: number;
  size: number;
  total: number;
  records: PointAppealView[];
}

function toPointAppealView(record: Api.Point.RealAppealDTO): PointAppealView {
  return {
    id: String(record.id),
    ledgerId: String(record.ledgerId),
    behaviorCode: record.behaviorCode || '',
    behaviorName: record.behaviorName || record.behaviorCode || '积分变动',
    originalScore: Number(record.originalScore || 0),
    reason: record.reason,
    status: record.status,
    reviewComment: record.reviewComment || record.decision || '',
    createdAt: record.createdAt,
    reviewedAt: record.reviewedAt
  };
}

export async function fetchPointAppeals(
  query: Api.Point.RealAppealPageQuery = {}
): Promise<PointAppealPage> {
  const page = await realUserRequest<Api.Point.RealAppealPage, Api.Point.RealAppealPageQuery>({
    url: '/points/appeals/page',
    method: 'POST',
    data: query
  });
  return {
    current: page.pageNo,
    size: page.pageSize,
    total: page.total,
    records: page.records.map(toPointAppealView)
  };
}
