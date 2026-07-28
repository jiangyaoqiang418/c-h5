<script setup lang="ts">
import { ref, watch } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { orderApi } from '@shared';
import OrderCard from '@/components/order/order-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

interface TabDef {
  key: string;
  label: string;
  statuses?: Api.Order.OrderStatus[];
}
const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待付款', statuses: ['PENDING_PAYMENT'] },
  { key: 'ship', label: '待发货', statuses: ['PROCURING', 'PROCURED'] },
  { key: 'transit', label: '待收货', statuses: ['IN_TRANSIT', 'AFTERSALE_CONFIRM'] },
  { key: 'done', label: '已完成', statuses: ['COMPLETED', 'WARRANTY'] }
];

const activeKey = ref('all');
const orders = ref<Api.Order.OrderRecord[]>([]);
const loading = ref(false);

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const params: { customerId?: number; shopperId?: number; statuses?: Api.Order.OrderStatus[]; size: number } = {
      size: 30,
      statuses: tab?.statuses
    };
    if (userStore.isBuyerActive) params.shopperId = userStore.currentUser.id;
    else params.customerId = userStore.currentUser.id;
    const r = await orderApi.fetchMyOrders(params);
    orders.value = r.records;
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

onShow(load);
onPullDownRefresh(load);
watch(activeKey, load);
watch(() => userStore.currentAudience, load);

async function pay(o: Api.Order.OrderRecord) {
  const r = await orderApi.payOrderMock(o.id);
  if (r.ok) {
    uni.showToast({ title: '支付成功', icon: 'success' });
    load();
  } else uni.showToast({ title: r.message || '失败', icon: 'none' });
}

function cancel(o: Api.Order.OrderRecord) {
  uni.showModal({
    title: '取消订单？',
    success: async r => {
      if (r.confirm) {
        await orderApi.cancelOrderMock(o.id, '顾客取消');
        load();
      }
    }
  });
}

function confirm(o: Api.Order.OrderRecord) {
  uni.showModal({
    title: '确认收货？',
    success: async r => {
      if (r.confirm) {
        await orderApi.confirmReceiptMock(o.id);
        uni.showToast({ title: '已确认收货', icon: 'success' });
        load();
      }
    }
  });
}

function review(o: Api.Order.OrderRecord) {
  go(`/pages/review/write?orderId=${o.id}`);
}

function aftersale(o: Api.Order.OrderRecord) {
  go(`/pages/aftersale/create?orderId=${o.id}`);
}
</script>

<template>
  <view class="order-list-page">
    <wd-tabs v-model="activeKey" sticky>
      <wd-tab v-for="t in TABS" :key="t.key" :name="t.key" :title="t.label" />
    </wd-tabs>

    <view class="list">
      <view v-if="orders.length">
        <OrderCard
          v-for="o in orders"
          :key="o.id"
          :order="o"
          @pay="pay"
          @cancel="cancel"
          @confirm="confirm"
          @review="review"
          @aftersale="aftersale"
        />
      </view>
      <EmptyState v-else-if="!loading" title="该状态下没有订单" description="完成购物后这里会显示" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.order-list-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 32rpx;
}
.list {
  padding: 16rpx;
}
</style>
