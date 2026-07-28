<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { vipApi } from '@shared';
import AudienceSegment from '@/components/common/audience-segment.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const audience = ref<Api.Vip.Audience>('customer');
const configs = ref<Api.Vip.LevelConfig[]>([]);
type VipStatus = Awaited<ReturnType<typeof vipApi.fetchMyVipStatus>>;
const myStatus = ref<VipStatus>();

onMounted(async () => {
  configs.value = await vipApi.fetchVipConfigs();
  await reloadMy();
});

async function reloadMy() {
  if (!userStore.currentUser) return;
  myStatus.value = await vipApi.fetchMyVipStatus(userStore.currentUser.id);
  audience.value = myStatus.value?.audience || 'customer';
}

watch(audience, async () => {
  await reloadMy();
});

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
  <view class="vip-page">
    <view class="hero">
      <text class="hero-title">VIP 特权中心</text>
      <view class="my-card">
        <VipBadge v-if="myStatus" :level="myStatus.vipLevel" />
        <view class="my-info">
          <text class="my-points">{{ myStatus?.points || 0 }} 积分</text>
          <text v-if="myStatus?.nextThreshold" class="my-next">距下一级还差 {{ myStatus.nextThreshold - myStatus.points }} 积分</text>
        </view>
      </view>
    </view>

    <view class="segment-wrap">
      <AudienceSegment v-model:audience="audience" :show-buyer="true" />
    </view>

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
.vip-page { min-height: 100vh; background: #f7f8fa; padding-bottom: 32rpx; }
.hero {
  background: linear-gradient(135deg, #722ed1 0%, #4d80f0 100%);
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
.segment-wrap { padding: 16rpx; background: #fff; }
.table-wrap { background: #fff; margin-top: 16rpx; padding: 16rpx 0; }
.th, .tr { display: flex; padding: 16rpx 24rpx; }
.tr:nth-child(even) { background: #fafbfc; }
.th { background: #f7f8fa; }
.th-cell, .td { flex: 1; text-align: center; font-size: 24rpx; }
.th-cell { font-weight: 600; color: #4e5969; }
.td { color: #1d2129; }
.label-col { flex: 1.5; text-align: left; color: #86909c; }
.rules { background: #fff; margin-top: 16rpx; padding: 24rpx; }
.rules-title { display: block; font-size: 26rpx; font-weight: 600; margin-bottom: 16rpx; }
.rules-text { display: block; font-size: 24rpx; color: #4e5969; line-height: 1.8; }
</style>
