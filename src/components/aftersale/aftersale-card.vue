<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';
import { go } from '@/utils/navigate';

interface Props {
  caseRecord: Api.Order.AftersaleCase;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'cancel', c: Api.Order.AftersaleCase): void }>();

const caseTypeMeta = computed(() => enums.AFTERSALE_CASE_TYPE_META[props.caseRecord.caseType]);
const statusMeta = computed(() => enums.AFTERSALE_STATUS_META[props.caseRecord.status]);

const statusTagType = computed(() => {
  const m: Record<string, string> = { orange: 'warning', red: 'danger', purple: 'primary', cyan: 'primary', green: 'success', gray: 'default' };
  return m[statusMeta.value.color] || 'default';
});

function detail() {
  go(`/pages/aftersale/detail?id=${props.caseRecord.id}`);
}

function openIm() {
  go(`/pages/im/order-group?orderCode=${props.caseRecord.orderCode}`);
}
</script>

<template>
  <view class="as-card" @click="detail">
    <view class="head">
      <text class="code">{{ caseRecord.code }}</text>
      <wd-tag :type="statusTagType" plain size="small">{{ statusMeta.label }}</wd-tag>
    </view>
    <view class="row">
      <wd-tag size="small" plain>{{ caseTypeMeta.label }}</wd-tag>
      <text class="order-link">订单 {{ caseRecord.orderCode }}</text>
    </view>
    <text class="appeal">{{ caseRecord.appeal }}</text>
    <view class="actions" @click.stop>
      <wd-button plain size="small" @click="openIm">三方群</wd-button>
      <wd-button
        v-if="caseRecord.status === 'pending'"
        type="error"
        plain
        size="small"
        @click="$emit('cancel', caseRecord)"
      >
        撤销
      </wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.as-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.code {
  font-size: 22rpx;
  color: #4e5969;
  font-family: ui-monospace, monospace;
}
.row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
}
.order-link {
  font-size: 22rpx;
  color: #86909c;
}
.appeal {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 26rpx;
  color: #1d2129;
  margin: 8rpx 0 16rpx;
  line-height: 1.5;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
}
</style>
