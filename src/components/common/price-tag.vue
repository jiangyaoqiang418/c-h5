<script setup lang="ts">
import { computed } from 'vue';
import { priceSet, formatUsdt, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import InfoTooltip from '@/components/common/info-tooltip.vue';

interface Props {
  price: string | number;
  shippingFee?: string | number;
  tax?: string | number;
  stock?: number;
  size?: 'sm' | 'md' | 'lg';
  showFee?: boolean;
  showRate?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  showFee: false,
  showRate: true
});

const set = computed(() => priceSet(props.price));
</script>

<template>
  <view class="price-tag" :class="size">
    <!-- 主：USDT 大字 -->
    <view class="main-line">
      <text class="usdt-value">{{ set.usdt }}</text>
    </view>
    <!-- 副 1：CNY 折算 -->
    <view class="sub-line">
      <text class="approx">≈ </text>
      <text class="cny-value">{{ set.cny }}</text>
    </view>
    <!-- 副 2：汇率 -->
    <view v-if="showRate" class="rate-line">
      <text>{{ set.rateLabel }}</text>
    </view>
    <!-- fees strip: U 单币 -->
    <view v-if="showFee" class="fees-strip">
      <view v-if="shippingFee != null" class="fee-item">
        <text class="fee-label">运费 </text>
        <text class="fee-num">{{ formatUsdt(shippingFee) }}</text>
      </view>
      <text v-if="shippingFee != null && tax != null" class="fee-sep"> | </text>
      <view v-if="tax != null" class="fee-item">
        <text class="fee-label">税费 </text>
        <text class="fee-num">{{ formatUsdt(tax) }}</text>
        <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="22" />
      </view>
      <text v-if="stock != null" class="fee-sep"> | </text>
      <view v-if="stock != null" class="fee-item">
        <text class="fee-label">库存 </text>
        <text class="fee-num">{{ stock }} 件</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.price-tag {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.main-line {
  display: flex;
  align-items: baseline;
}
.usdt-value {
  color: #0F111A;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  letter-spacing: -1rpx;
  font-variant-numeric: tabular-nums;
}
.sub-line {
  color: #6B7385;
  margin-top: 4rpx;
  font-family: ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}
.approx {
  color: #A8ADB8;
}
.cny-value {
  color: #6B7385;
  font-weight: 600;
}
.rate-line {
  color: #A8ADB8;
  font-family: ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  margin-top: 2rpx;
}
/* sizes */
.price-tag.sm .usdt-value { font-size: 30rpx; }
.price-tag.sm .sub-line   { font-size: 18rpx; }
.price-tag.sm .rate-line  { font-size: 16rpx; }
.price-tag.md .usdt-value { font-size: 44rpx; }
.price-tag.md .sub-line   { font-size: 22rpx; }
.price-tag.md .rate-line  { font-size: 18rpx; }
.price-tag.lg .usdt-value { font-size: 72rpx; }
.price-tag.lg .sub-line   { font-size: 26rpx; }
.price-tag.lg .rate-line  { font-size: 22rpx; }

/* Fees strip */
.fees-strip {
  padding-top: 16rpx;
  margin-top: 16rpx;
  border-top: 1rpx solid #EDECE6;
  font-size: 22rpx;
  color: #1D2129;
}
.fee-item {
  display: inline-flex;
  align-items: center;
}
.fee-label {
  color: #6B7385;
}
.fee-num {
  color: #0F111A;
  font-family: ui-monospace, monospace;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fee-sep {
  color: #C9CDD4;
}
</style>
