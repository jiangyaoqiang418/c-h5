<script setup lang="ts">
import { ref, watch } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { fetchBoughtOrders, fetchSoldOrders, cancelRealOrder, confirmRealOrder } from '@/service/api/order';
import OrderCard from '@/components/order/order-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

interface TabDef {
  key: string;
  label: string;
  status?: Api.RealOrder.OrderStatus;
}
const TABS: TabDef[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待付款', status: 'CREATED' },
  { key: 'ship', label: '待发货', status: 'PAID' },
  { key: 'transit', label: '待收货', status: 'SHIPPED' },
  { key: 'done', label: '已完成', status: 'COMPLETED' }
];

const activeKey = ref('all');
const orders = ref<Api.RealOrder.OrderView[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const tab = TABS.find(t => t.key === activeKey.value);
    const query = { pageNo: 1, pageSize: 30, status: tab?.status };
    const r = userStore.isBuyerActive ? await fetchSoldOrders(query) : await fetchBoughtOrders(query);
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

function pay(_o: Api.RealOrder.OrderView) {
  uni.showToast({ title: '支付将在结算链路迁移后开放', icon: 'none' });
}

function cancel(o: Api.RealOrder.OrderView) {
  uni.showModal({
    title: '取消订单？',
    success: async r => {
      if (r.confirm) {
        await cancelRealOrder({ id: o.id, reason: '顾客取消' });
        uni.showToast({ title: '订单已取消', icon: 'success' });
        await load();
      }
    }
  });
}

function confirm(o: Api.RealOrder.OrderView) {
  uni.showModal({
    title: '确认收货？',
    success: async r => {
      if (r.confirm) {
        await confirmRealOrder(o.id);
        uni.showToast({ title: '已确认收货', icon: 'success' });
        load();
      }
    }
  });
}

function review(o: Api.RealOrder.OrderView) {
  uni.showToast({ title: '评价功能尚未接入真实服务', icon: 'none' });
}

function aftersale(o: Api.RealOrder.OrderView) {
  uni.showToast({ title: '售后将在后续接口批次迁移', icon: 'none' });
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
  min-height: 100%;
  background: #f7f8fa;
  padding-bottom: 32rpx;
}
.list {
  padding: 16rpx;
}
</style>
