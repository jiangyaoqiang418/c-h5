<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { aftersaleApi, enums, orderApi } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';

const caseRec = ref<Api.Order.AftersaleCase>();
const order = ref<Api.Order.OrderRecord>();
const id = ref<number>();

onLoad(async query => {
  id.value = Number(query?.id);
  if (id.value) await reload();
});

async function reload() {
  if (!id.value) return;
  const r = await aftersaleApi.fetchAftersaleDetail(id.value);
  caseRec.value = r;
  if (r) order.value = await orderApi.fetchOrderDetail(r.orderId);
}

const statusMeta = computed(() => caseRec.value ? enums.AFTERSALE_STATUS_META[caseRec.value.status] : undefined);
const caseTypeMeta = computed(() => caseRec.value ? enums.AFTERSALE_CASE_TYPE_META[caseRec.value.caseType] : undefined);

function openGroup() {
  if (!order.value) return;
  go(`/pages/im/order-group?orderCode=${order.value.code}`);
}
</script>

<template>
  <view v-if="caseRec" class="as-detail">
    <view class="hero">
      <wd-tag v-if="statusMeta" plain size="medium">{{ statusMeta.label }}</wd-tag>
      <text class="code">{{ caseRec.code }}</text>
      <text class="type">{{ caseTypeMeta?.label }}</text>
    </view>

    <view class="section">
      <text class="section-title">顾客诉求</text>
      <text class="appeal">{{ caseRec.appeal }}</text>
      <view v-if="caseRec.evidenceUrls?.length" class="evidence">
        <image v-for="u in caseRec.evidenceUrls" :key="u" :src="u" mode="aspectFill" class="ev-img" />
      </view>
    </view>

    <view v-if="caseRec.refundAmount" class="section">
      <text class="section-title">退款金额</text>
      <text class="amount">U {{ formatAmount(caseRec.refundAmount) }}</text>
    </view>

    <view v-if="caseRec.verdict" class="section">
      <text class="section-title">仲裁结果</text>
      <text class="appeal">{{ caseRec.verdict }} {{ caseRec.verdictNote ? ' · ' + caseRec.verdictNote : '' }}</text>
    </view>

    <view v-if="caseRec.shopperResponse" class="section">
      <text class="section-title">买手响应</text>
      <text class="appeal">{{ caseRec.shopperResponse === 'agreed' ? '已同意' : '已拒绝' }}{{ caseRec.shopperResponseNote ? ' · ' + caseRec.shopperResponseNote : '' }}</text>
    </view>

    <view class="section">
      <text class="section-title">操作</text>
      <wd-button block @click="openGroup">打开三方群</wd-button>
      <wd-button block plain class="mt" @click="go(`/pages/order/detail?id=${caseRec.orderId}`)">查看关联订单</wd-button>
    </view>
  </view>
  <EmptyState v-else title="售后不存在" />
</template>

<style lang="scss" scoped>
.as-detail { min-height: 100%; background: #f7f8fa; }
.hero { background: #fff; padding: 32rpx; }
.code { display: block; font-family: ui-monospace, monospace; font-size: 22rpx; color: #86909c; margin: 12rpx 0; }
.type { display: block; font-size: 30rpx; font-weight: 700; }
.section { background: #fff; margin-top: 16rpx; padding: 24rpx 32rpx; }
.section-title { display: block; font-size: 26rpx; font-weight: 600; margin-bottom: 16rpx; }
.appeal { font-size: 24rpx; color: #4e5969; line-height: 1.6; }
.amount { font-size: 40rpx; font-weight: 700; color: #f53f3f; font-family: ui-monospace, monospace; }
.evidence { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx; }
.ev-img { width: 160rpx; height: 160rpx; border-radius: 8rpx; }
.mt { margin-top: 12rpx; }
</style>
