<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import InfoTooltip from '@/components/common/info-tooltip.vue';

interface Props {
  product: Api.FinanceProduct.ProductRecord;
  vipBonusRate?: number;
}
const props = withDefaults(defineProps<Props>(), { vipBonusRate: 0 });

const effectiveRate = computed(() =>
  ((Number(props.product.baseRate) || 0) + props.vipBonusRate).toFixed(2)
);

const productIcon = computed(() => {
  const days = props.product.lockupDays;
  if (days <= 7) return '💧';
  if (days <= 30) return '💰';
  if (days <= 90) return '🔒';
  return '🏦';
});

function goDetail() {
  go(`/pages/finance/detail?id=${props.product.id}`);
}
</script>

<template>
  <view class="ef-card">
    <view class="ef-head" @click="goDetail">
      <view class="ef-left">
        <view class="ef-icon-wrap">
          <text class="ef-icon">{{ productIcon }}</text>
        </view>
        <view class="ef-info">
          <text class="ef-name">{{ product.name }}</text>
          <text class="ef-meta">
            锁定 {{ product.lockupDays }} 天 · 起投 U {{ formatAmount(product.minAmount) }}
          </text>
        </view>
      </view>
      <view class="ef-right">
        <view class="ef-apy-row">
          <text class="ef-apy-label">APY</text>
          <InfoTooltip text="APY = 年化收益率。含基准利率 + VIP 加成，日结到不可提现桶" :size="18" />
        </view>
        <text class="ef-apy">{{ effectiveRate }}%</text>
      </view>
    </view>
    <button class="ef-deposit" @click="goDetail">存入</button>
  </view>
</template>

<style lang="scss" scoped>
.ef-card {
  background: #FFFFFF;
  border: 1rpx solid #EDECE6;
  border-radius: 24rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.ef-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
}
.ef-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
  flex: 1;
  min-width: 0;
}
.ef-icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #FAFAF7;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ef-icon {
  font-size: 40rpx;
}
.ef-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}
.ef-name {
  font-size: 32rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -0.5rpx;
}
.ef-meta {
  font-size: 22rpx;
  color: #86909C;
}
.ef-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}
.ef-apy-row {
  display: flex;
  align-items: center;
  gap: 4rpx;
}
.ef-apy-label {
  font-size: 20rpx;
  font-weight: 600;
  color: #86909C;
  letter-spacing: 1rpx;
}
.ef-apy {
  font-family: ui-monospace, monospace;
  font-size: 40rpx;
  font-weight: 700;
  color: #00A88A;
  letter-spacing: -1rpx;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ef-deposit {
  background: transparent;
  color: #B8935A;
  border: 2rpx solid #B8935A;
  border-radius: 999rpx;
  padding: 24rpx 0;
  font-size: 28rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  text-align: center;
  width: 100%;
}
.ef-deposit::after {
  border: none;
}
</style>
