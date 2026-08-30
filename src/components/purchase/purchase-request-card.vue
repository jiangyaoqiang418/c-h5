<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import PushTierBadge from './push-tier-badge.vue';

interface Props {
  request: Api.PurchaseRequest.PurchaseRequest;
  mode?: 'hall' | 'mine';
  canClaim?: boolean;
  cancelDisabled?: boolean;
  navigationDisabled?: boolean;
}
const props = withDefaults(defineProps<Props>(), { mode: 'hall', canClaim: false });
defineEmits<{
  (e: 'claim', req: Api.PurchaseRequest.PurchaseRequest): void;
  (e: 'cancel', req: Api.PurchaseRequest.PurchaseRequest): void;
}>();

const statusMeta = computed(() => enums.PURCHASE_STATUS_META[props.request.status]);
const aftersaleMeta = computed(() => enums.AFTERSALE_TYPE_META[props.request.aftersaleType]);

function goDetail() {
  if (props.navigationDisabled) return;
  go(`/pages/purchase/detail?id=${props.request.id}`);
}
</script>

<template>
  <view class="pr-card" @click="goDetail">
    <view class="head">
      <view class="status-pill yb-status-pill" :data-status="request.status">
        <text>● {{ statusMeta.label }}</text>
      </view>
      <PushTierBadge v-if="request.status === 'pushing' && request.currentPushLevel" :level="request.currentPushLevel" />
    </view>

    <view class="body">
      <view class="left">
        <view class="cat"><wd-icon name="goods" size="13px" /> <text>{{ request.categoryPath }}</text></view>
        <text class="title">{{ request.productTitle }}</text>
        <text v-if="request.appeal" class="appeal">"{{ request.appeal }}"</text>
        <view class="chips">
          <view class="chip"><wd-icon name="clock" size="12px" /> <text>{{ request.expectedDays }} 天</text></view>
          <view class="chip"><wd-icon name="shield" size="12px" /> <text>{{ aftersaleMeta.label }}</text></view>
          <view v-if="request.overseasCustoms" class="chip gold"><wd-icon name="location" size="12px" /> <text>海外</text></view>
        </view>
      </view>
      <view class="reward">
        <text class="reward-label">悬赏</text>
        <view class="reward-amount">
          <text class="unit">U</text>
          <text class="num">{{ formatAmount(request.budgetAmount) }}</text>
        </view>
      </view>
    </view>

    <view v-if="mode === 'mine' && request.claimedByName" class="claimed">
      <wd-icon name="check" size="13px" /> 已被买手 <text class="strong">{{ request.claimedByName }}</text> 接单
    </view>
    <view v-if="mode === 'mine' && request.status === 'rejected' && request.auditNote" class="rejected-note">
      驳回原因：{{ request.auditNote }}
    </view>

    <view class="actions" @click.stop>
      <wd-button
        v-if="mode === 'hall' && canClaim && request.status === 'pushing'"
        type="primary"
        size="small"
        @click="$emit('claim', request)"
      >
        我接此单
      </wd-button>
      <wd-button
        v-if="mode === 'mine' && ['pending_audit', 'pushing'].includes(request.status)"
        :disabled="cancelDisabled"
        type="error"
        plain
        size="small"
        @click="$emit('cancel', request)"
      >
        撤销
      </wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.pr-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 28rpx;
  margin-bottom: 16rpx;
  border: 1rpx solid #EDECE6;
  box-shadow: 0 4rpx 12rpx rgba(15, 17, 26, 0.04);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.status-pill {
  background: rgba(91, 92, 231, 0.08);
  color: #5B5CE7;
  font-family: ui-monospace, monospace;
}
.status-pill[data-status='pushing'] {
  background: rgba(0, 168, 138, 0.1);
  color: #00A88A;
}
.status-pill[data-status='claimed'] {
  background: #F6EFE4;
  color: #B8935A;
}
.body {
  display: flex;
  gap: 20rpx;
  align-items: flex-start;
}
.left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}
.cat {
  font-size: 20rpx;
  color: #6B7385;
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.title {
  font-size: 30rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -0.5rpx;
  line-height: 1.35;
}
.appeal {
  font-size: 24rpx;
  color: #6B7385;
  font-style: italic;
  padding-left: 16rpx;
  border-left: 4rpx solid #EDECE6;
  margin-top: 8rpx;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 8rpx;
}
.chip {
  padding: 4rpx 14rpx;
  background: #FAFAF7;
  border-radius: 999rpx;
  font-size: 20rpx;
  color: #1D2129;
  display: inline-flex;
  align-items: center;
  gap: 5rpx;
}
.chip.gold {
  background: #F6EFE4;
  color: #B8935A;
}
.reward {
  padding: 20rpx 24rpx;
  background: linear-gradient(135deg, rgba(91, 92, 231, 0.08) 0%, transparent 100%);
  border: 1rpx solid rgba(91, 92, 231, 0.15);
  border-radius: 16rpx;
  text-align: right;
  min-width: 180rpx;
}
.reward-label {
  display: block;
  font-size: 18rpx;
  color: #5B5CE7;
  font-weight: 600;
  letter-spacing: 3rpx;
  text-transform: uppercase;
  margin-bottom: 6rpx;
}
.reward-amount {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  justify-content: flex-end;
  color: #5B5CE7;
}
.reward-amount .unit {
  font-family: ui-monospace, monospace;
  font-size: 22rpx;
  font-weight: 600;
}
.reward-amount .num {
  font-family: ui-monospace, monospace;
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
}
.claimed {
  padding: 12rpx 20rpx;
  background: rgba(0, 168, 138, 0.08);
  color: #00A88A;
  border-radius: 12rpx;
  font-size: 22rpx;
  margin-top: 16rpx;
}
.claimed .strong {
  color: #0F111A;
  font-weight: 600;
}
.rejected-note {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 12rpx 20rpx;
  border-radius: 12rpx;
  background: #fff2f0;
  color: #d4380d;
  font-size: 22rpx;
  line-height: 1.5;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16rpx;
}
</style>
