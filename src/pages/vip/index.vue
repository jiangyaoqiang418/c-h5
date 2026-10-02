<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import VipBadge from '@/components/common/vip-badge.vue';
import { fetchPointAccount, fetchVipConfigs, type PointAccount } from '@/service/api/point';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const configs = ref<Api.Vip.LevelConfig[]>([]);
const pointAccount = ref<PointAccount>();
const loading = ref(false);
const loadFailed = ref(false);
let loadSequence = 0;
const page = usePageOperation(() => {
  loadSequence++;
  pointAccount.value = undefined;
  loading.value = false;
  loadFailed.value = false;
});

// 权益预览不是业务身份切换，非买手也能查看买手权益。
const audience = ref<Api.Vip.Audience>(
  userStore.isBuyerActive ? 'buyer' : 'customer'
);
const activeVip = computed(() => (
  audience.value === 'buyer' ? pointAccount.value?.buyer : pointAccount.value?.customer
));
const vipLevel = computed<Api.User.VipLevel | undefined>(() => {
  const level = activeVip.value?.level;
  return level === 'VIP0' || level === 'VIP1' || level === 'VIP2' ? level : undefined;
});
const points = computed(() => {
  const value = pointAccount.value?.points ?? userStore.currentUser?.points;
  return value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);
});
const pointsToNext = computed(() => {
  const nextThreshold = Number(activeVip.value?.nextThreshold);
  if (points.value == null || !Number.isFinite(nextThreshold) || nextThreshold <= points.value) return undefined;
  return nextThreshold - points.value;
});

async function load() {
  if (!page.visible.value || loading.value) return;
  const operation = page.capture();
  const sequence = ++loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    const configTask = fetchVipConfigs();
    const accountTask = (async () => {
      await userStore.init();
      if (!operation.isCurrent()) return undefined;
      if (!userStore.currentUser && getAccessToken()) throw new Error('账户资料暂未加载成功');
      return userStore.currentUser ? fetchPointAccount() : undefined;
    })();
    const [catalog, account] = await Promise.allSettled([configTask, accountTask]);
    if (!operation.isCurrent() || sequence !== loadSequence) return;
    if (catalog.status === 'fulfilled') configs.value = catalog.value;
    if (account.status === 'fulfilled') pointAccount.value = account.value;
    loadFailed.value = catalog.status === 'rejected' || account.status === 'rejected';
  } catch (error) {
    if (operation.isCurrent()) loadFailed.value = true;
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
onShow(load);
onHide(() => { loadSequence++; loading.value = false; });

const audienceConfigs = computed(() => configs.value.filter(c => c.audience === audience.value));
const fullComparisonOpen = ref(false);
const featuredConfigs = computed(() => {
  if (!vipLevel.value) return [];
  const current = audienceConfigs.value.find(config => config.level === vipLevel.value);
  if (!current) return [];
  const levels = ['VIP0', 'VIP1', 'VIP2'];
  const nextLevel = levels[levels.indexOf(vipLevel.value) + 1];
  const next = audienceConfigs.value.find(config => config.level === nextLevel);
  return next ? [current, next] : [current];
});
function configTitle(config: Api.Vip.LevelConfig) { return config.label.replace(/（当前）$/, ''); }
function configIsCurrent(config: Api.Vip.LevelConfig) { return config.level === vipLevel.value || config.label.endsWith('（当前）'); }

const customerRows = [
  { key: 'interestRateBonus', label: '小金库利率上浮 (%)' },
  { key: 'purchaseConcurrent', label: '求购同时存在' },
  { key: 'purchasePriority', label: '求购优先级配置值' },
  { key: 'aftersaleResponse', label: '售后响应优先级配置值' },
  { key: 'withdrawFeeDiscount', label: '转出手续费减免 (%)' }
];
const buyerRows = [
  { key: 'pushIntervalMinutes', label: '推送间隔（分钟）' },
  { key: 'transactionFeeDiscount', label: '交易手续费减免 (%)' },
  { key: 'productSlotsMax', label: '在架商品上限' }
];
const rows = computed(() => audience.value === 'customer' ? customerRows : buyerRows);

function benefitValue(c: Api.Vip.LevelConfig, key: string): string | number {
  const b: any = audience.value === 'customer' ? c.customerBenefits : c.buyerBenefits;
  return b?.[key] ?? '-';
}
</script>

<template>
  <view class="vip-page yb-page">
    <view class="hero" >
      <text class="hero-title">当前会员等级</text>
      <view class="my-card">
        <VipBadge v-if="vipLevel" :level="vipLevel" />
        <view class="my-info">
          <text class="my-points">{{ points == null ? '—' : points }} 积分</text>
          <text v-if="pointsToNext !== undefined" class="my-next">距下一级还差 {{ pointsToNext }} 积分</text>
        </view>
      </view>
    </view>

    <view class="segment-wrap">
      <wd-tabs v-model="audience"><wd-tab name="customer" title="顾客权益" /><wd-tab name="buyer" title="买手权益" /></wd-tabs>
    </view>

    <wd-button v-if="loadFailed" block plain :loading="loading" @click="load">部分 VIP 数据加载失败，点击重试</wd-button>

    <view v-if="featuredConfigs.length" class="featured-levels">
      <view v-for="c in featuredConfigs" :key="c.level" class="benefit-card" :class="{ 'benefit-card--current': configIsCurrent(c) }">
        <view class="benefit-header"><text class="benefit-title">{{ configTitle(c) }}</text><text class="level-label">{{ configIsCurrent(c) ? '当前等级' : '下一等级' }}</text></view>
        <text class="threshold">积分阈值 {{ c.threshold }}</text>
        <view v-for="row in rows" :key="row.key" class="benefit-row"><text>{{ row.label }}</text><text class="benefit-value">{{ benefitValue(c, row.key) }}</text></view>
      </view>
    </view>
    <view v-if="audienceConfigs.length" class="table-wrap">
      <view v-if="featuredConfigs.length" class="comparison-toggle" @click="fullComparisonOpen = !fullComparisonOpen"><text>完整权益对照</text><text>{{ fullComparisonOpen ? '收起' : '展开' }}</text></view>
      <scroll-view v-if="!featuredConfigs.length || fullComparisonOpen" scroll-x class="comparison-scroll">
        <view class="comparison-table" :style="{ width: `${220 + audienceConfigs.length * 136}rpx` }">
          <view class="th">
            <text class="th-cell label-col">权益项</text>
            <view v-for="c in audienceConfigs" :key="c.level" class="th-cell" :class="{ 'current-level': configIsCurrent(c) }"><text>{{ configTitle(c) }}</text><text v-if="configIsCurrent(c)" class="current-badge">当前</text></view>
          </view>
          <view v-for="row in rows" :key="row.key" class="tr">
            <text class="td label-col">{{ row.label }}</text>
            <text v-for="c in audienceConfigs" :key="c.level" class="td" :class="{ 'current-level': configIsCurrent(c) }">{{ benefitValue(c, row.key) }}</text>
          </view>
        </view>
      </scroll-view>
      <text v-if="audience === 'customer'" class="config-note">优先级按当前配置值展示，不代表具体响应时长。</text>
    </view>

    <view class="rules">
      <text class="rules-title">升级规则</text>
      <text class="rules-text">·积分由消费、好评、求购成交贡献</text>
      <text class="rules-text">·达到阈值自动升级，无降级</text>
      <text class="rules-text">·VIP 权益于次日 0 点生效</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.vip-page { min-height:100%; padding:20rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); }
.hero {
  background-color: var(--yb-surface);
  background-size: cover;
  background-position: center;
  color: var(--yb-ink);
  padding:24rpx;
  border:1rpx solid var(--yb-border);
  border-radius:var(--yb-radius-lg);
}
.hero-title { display: block; font-size: 36rpx; font-weight: 700; }
.my-card {
  margin-top: 24rpx;
  background: var(--yb-bg);
  border-radius: 16rpx;
  padding: 24rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.my-info { display: flex; flex-direction: column; }
.my-points { font-size: 32rpx; font-weight: 600; }
.my-next { font-size:24rpx; color:var(--yb-muted); margin-top:4rpx; }
.segment-wrap { margin-top:20rpx; padding:8rpx 0; background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.table-wrap { overflow:hidden; background:#fff; margin-top:20rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.featured-levels { display:flex; flex-direction:column; gap:16rpx; margin-top:20rpx; }
.benefit-card { padding:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); background:#fff; }
.benefit-card--current { border-color:var(--yb-brand); }.benefit-header { display:flex; align-items:center; gap:12rpx; }.benefit-title { font-size:32rpx; font-weight:700; }.level-label { padding:4rpx 12rpx; border-radius:8rpx; background:var(--yb-bg); font-size:24rpx; color:var(--yb-ink-2); white-space:nowrap; }.threshold { display:block; margin-top:8rpx; color:var(--yb-muted); font-size:24rpx; }
.benefit-row { display:flex; justify-content:space-between; gap:24rpx; padding-top:16rpx; color:var(--yb-ink-2); font-size:26rpx; }.benefit-value { flex-shrink:0; color:var(--yb-ink); font-weight:600; font-variant-numeric:tabular-nums; }
.comparison-toggle { display:flex; align-items:center; justify-content:space-between; gap:24rpx; min-height:96rpx; padding:0 24rpx; font-size:26rpx; color:var(--yb-ink-2); }.comparison-table { min-width:100%; }.comparison-scroll { width:100%; }.config-note { display:block; padding:16rpx 24rpx; color:var(--yb-muted); font-size:24rpx; line-height:1.6; }
.th, .tr { display:flex; padding:16rpx 0; }
.tr:nth-child(even) { background: #fafbfc; }
.th { background: #f5f5f2; }
.th-cell, .td { flex:1; min-width:136rpx; padding:0 12rpx; box-sizing:border-box; text-align:center; font-size:24rpx; overflow-wrap:break-word; }
.th-cell { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8rpx; font-weight:600; color:var(--yb-ink-2); }
.td { color: #1d2129; }
.label-col { flex:0 0 220rpx; min-width:220rpx; padding-left:24rpx; text-align:left; align-items:flex-start; color:var(--yb-ink-2); white-space:normal; }.current-badge { padding:2rpx 8rpx; border-radius:6rpx; background:var(--yb-brand-soft); color:var(--yb-brand); font-size:24rpx; line-height:1.4; }
.rules { background:#fff; margin-top:20rpx; padding:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.rules-title { display: block; font-size: 26rpx; font-weight: 600; margin-bottom: 16rpx; }
.rules-text { display: block; font-size: 24rpx; color: #4e5969; line-height: 1.8; }
.current-level { background: var(--yb-brand-soft); color: var(--yb-brand); font-weight: 600; }
</style>
