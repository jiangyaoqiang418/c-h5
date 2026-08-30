<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import VipBadge from '@/components/common/vip-badge.vue';
import { fetchPointAccount, fetchVipConfigs, type PointAccount } from '@/service/api/point';
import { useUserStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';

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

const customerRows = [
  { key: 'interestRateBonus', label: '小金库利率上浮 (%)' },
  { key: 'purchaseConcurrent', label: '求购同时存在' },
  { key: 'purchasePriority', label: '求购优先级' },
  { key: 'aftersaleResponse', label: '售后响应优先级' },
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
    <view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.vip})` }">
      <text class="hero-title">VIP 特权中心</text>
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

    <view class="table-wrap">
      <view class="th">
        <text class="th-cell label-col">权益项</text>
        <text v-for="c in audienceConfigs" :key="c.level" class="th-cell">{{ c.label }}</text>
      </view>
      <view v-for="row in rows" :key="row.key" class="tr">
        <text class="td label-col">{{ row.label }}</text>
        <text v-for="c in audienceConfigs" :key="c.level" class="td">{{ benefitValue(c, row.key) }}</text>
      </view>
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
.vip-page { min-height: 100%; padding-bottom: 32rpx; }
.hero {
  background-color: #30110f;
  background-size: cover;
  background-position: center;
  color: #fff;
  padding: 48rpx 32rpx;
}
.hero-title { display: block; font-size: 36rpx; font-weight: 700; }
.my-card {
  margin-top: 24rpx;
  background: rgba(255,255,255,0.15);
  border-radius: 16rpx;
  padding: 24rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.my-info { display: flex; flex-direction: column; }
.my-points { font-size: 32rpx; font-weight: 600; }
.my-next { font-size: 22rpx; opacity: 0.8; margin-top: 4rpx; }
.segment-wrap { margin:20rpx 24rpx 0; padding:16rpx; background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.table-wrap { overflow:hidden; background:#fff; margin:20rpx 24rpx 0; padding:16rpx 0; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.th, .tr { display: flex; padding: 16rpx 24rpx; }
.tr:nth-child(even) { background: #fafbfc; }
.th { background: #f5f5f2; }
.th-cell, .td { flex: 1; text-align: center; font-size: 24rpx; }
.th-cell { font-weight: 600; color: #4e5969; }
.td { color: #1d2129; }
.label-col { flex: 1.5; text-align: left; color: #86909c; }
.rules { background:#fff; margin:20rpx 24rpx 0; padding:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.rules-title { display: block; font-size: 26rpx; font-weight: 600; margin-bottom: 16rpx; }
.rules-text { display: block; font-size: 24rpx; color: #4e5969; line-height: 1.8; }
</style>
