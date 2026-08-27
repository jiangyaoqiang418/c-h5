<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { cancelRealRefund, fetchBoughtRefunds, fetchSoldRefunds } from '@/service/api/order';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { go } from '@/utils/navigate';
import { formatUsdt } from '@shared/utils/currency';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const activeKey = ref('all');
const loading = ref(false);
const list = ref<Api.RealOrder.OrderRefundDTO[]>([]);

const TABS: { key: string; label: string; status?: Api.RealOrder.RefundStatus }[] = [
  { key: 'all', label: '全部' },
  { key: 'applying', label: '待审核', status: 'APPLYING' },
  { key: 'agreed', label: '已同意', status: 'AGREED' },
  { key: 'rejected', label: '已驳回', status: 'REJECTED' },
  { key: 'canceled', label: '已撤销', status: 'CANCELED' }
];

const statusLabel: Record<Api.RealOrder.RefundStatus, string> = {
  APPLYING: '待审核', AGREED: '已同意', REJECTED: '已驳回', CANCELED: '已撤销'
};
const emptyDescription = computed(() => userStore.isBuyerActive ? '顾客发起的仅退款会显示在这里' : '可在待发货或待收货订单中申请仅退款');

async function load() {
  loading.value = true;
  try {
    const tab = TABS.find(item => item.key === activeKey.value);
    const query = { pageNo: 1, pageSize: 30, status: tab?.status };
    const page = userStore.isBuyerActive ? await fetchSoldRefunds(query) : await fetchBoughtRefunds(query);
    list.value = page.records;
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

function openDetail(item: Api.RealOrder.OrderRefundDTO) {
  go(`/pages/aftersale/detail?id=${item.refundId}`);
}

function cancel(item: Api.RealOrder.OrderRefundDTO) {
  uni.showModal({
    title: '撤销仅退款申请？',
    content: '撤销后订单将恢复为原来的待处理状态。',
    success: async result => {
      if (!result.confirm) return;
      await cancelRealRefund(item.refundId);
      uni.showToast({ title: '申请已撤销', icon: 'success' });
      await load();
    }
  });
}

onShow(load);
onPullDownRefresh(load);
watch(activeKey, load);
watch(() => userStore.currentAudience, load);
</script>

<template>
  <view class="as-list-page yb-page">
    <wd-tabs v-model="activeKey" sticky>
      <wd-tab v-for="tab in TABS" :key="tab.key" :name="tab.key" :title="tab.label" />
    </wd-tabs>
    <view class="list">
      <view v-if="list.length">
        <view v-for="item in list" :key="item.refundId" class="refund-card" @click="openDetail(item)">
          <view class="head">
            <text class="code">订单 {{ item.orderNo || item.orderId }}</text>
            <text class="status" :class="`status-${item.status.toLowerCase()}`">{{ item.statusText || statusLabel[item.status] }}</text>
          </view>
          <view class="body">
            <image :src="item.productImage || UI_ASSETS.placeholders.product" mode="aspectFill" class="cover" />
            <view class="info">
              <text class="title">{{ item.productTitle || '商品信息待补充' }}</text>
              <text class="reason">退款原因：{{ item.reason || '未填写' }}</text>
              <text class="counterpart">{{ userStore.isBuyerActive ? '顾客' : '买手' }}：{{ userStore.isBuyerActive ? (item.buyerName || '—') : (item.sellerName || '—') }}</text>
            </view>
            <text class="amount">{{ formatUsdt(item.amount || 0) }}</text>
          </view>
          <view v-if="!userStore.isBuyerActive && item.status === 'APPLYING'" class="actions" @click.stop>
            <wd-button plain size="small" @click="cancel(item)">撤销申请</wd-button>
          </view>
        </view>
      </view>
      <EmptyState v-else-if="!loading" title="暂无仅退款记录" :description="emptyDescription" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.as-list-page { min-height: 100%; }
.list { padding: 24rpx; }
.refund-card { margin-bottom: 20rpx; padding: 24rpx; border-radius: var(--yb-radius-lg); background: var(--yb-surface); border:1rpx solid var(--yb-border); box-shadow:var(--yb-shadow-card); }
.head, .body, .actions { display: flex; }
.head { justify-content: space-between; align-items: center; padding-bottom: 16rpx; border-bottom: 1rpx dashed #f2f3f5; }
.code { min-width: 0; overflow: hidden; color: #4e5969; font-family: ui-monospace, monospace; font-size: 22rpx; text-overflow: ellipsis; white-space: nowrap; }
.status { flex-shrink: 0; margin-left: 16rpx; font-size: 24rpx; color: #ff7d00; }
.status-agreed { color: #00b42a; }.status-rejected, .status-canceled { color: #86909c; }
.body { gap: 16rpx; padding-top: 16rpx; }
.cover { width: 128rpx; height: 128rpx; flex-shrink: 0; border-radius: var(--yb-radius-md); }
.info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
.title { display:-webkit-box; overflow:hidden; -webkit-box-orient:vertical; -webkit-line-clamp:2; font-size:26rpx; line-height:1.45; font-weight:500; color:#1d2129; }.reason, .counterpart { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:22rpx; color:#86909c; }
.amount { flex-shrink: 0; color: #0f111a; font-family: ui-monospace, monospace; font-size: 28rpx; font-weight: 700; }
.actions { justify-content: flex-end; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx dashed #f2f3f5; }
</style>
