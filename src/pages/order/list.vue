<script setup lang="ts">
import { ref, watch } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { fetchBoughtOrders, fetchSoldOrders, cancelRealOrder, confirmRealOrder, shipRealOrder } from '@/service/api/order';
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
const shippingOrder = ref<Api.RealOrder.OrderView>();
const shippingPopupVisible = ref(false);
const shippingSubmitting = ref(false);
const shippingForm = ref({ logisticsCompany: '顺丰速运', logisticsCompanyCode: 'SF', trackingNo: '', remark: '' });

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

function openShipping(o: Api.RealOrder.OrderView) {
  shippingOrder.value = o;
  shippingForm.value = { logisticsCompany: '顺丰速运', logisticsCompanyCode: 'SF', trackingNo: '', remark: '' };
  shippingPopupVisible.value = true;
}

async function submitShipping() {
  if (!shippingOrder.value || !shippingForm.value.logisticsCompany.trim() || !shippingForm.value.trackingNo.trim()) {
    uni.showToast({ title: '请填写物流公司和运单号', icon: 'none' });
    return;
  }
  shippingSubmitting.value = true;
  try {
    await shipRealOrder({
      id: shippingOrder.value.id,
      logisticsCompany: shippingForm.value.logisticsCompany.trim(),
      logisticsCompanyCode: shippingForm.value.logisticsCompanyCode.trim() || undefined,
      trackingNo: shippingForm.value.trackingNo.trim(),
      remark: shippingForm.value.remark.trim() || undefined
    });
    uni.showToast({ title: '已提交发货信息', icon: 'success' });
    shippingOrder.value = undefined;
    shippingPopupVisible.value = false;
    await load();
  } finally {
    shippingSubmitting.value = false;
  }
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
          :seller-mode="userStore.isBuyerActive"
          @pay="pay"
          @cancel="cancel"
          @confirm="confirm"
          @review="review"
          @aftersale="aftersale"
          @ship="openShipping"
        />
      </view>
      <EmptyState v-else-if="!loading" title="该状态下没有订单" description="完成购物后这里会显示" />
    </view>

    <wd-popup v-model="shippingPopupVisible" position="bottom" :safe-area-inset-bottom="true">
      <view class="shipping-popup">
        <text class="shipping-title">填写发货信息</text>
        <text v-if="shippingOrder" class="shipping-order">订单 {{ shippingOrder.code }}</text>
        <wd-input v-model="shippingForm.logisticsCompany" label="物流公司" placeholder="如：顺丰速运" />
        <wd-input v-model="shippingForm.logisticsCompanyCode" label="物流编码" placeholder="如：SF（可选）" />
        <wd-input v-model="shippingForm.trackingNo" label="运单号" placeholder="请输入真实运单号" />
        <wd-input v-model="shippingForm.remark" label="发货备注" placeholder="可选" />
        <wd-button type="primary" block :loading="shippingSubmitting" @click="submitShipping">确认发货</wd-button>
      </view>
    </wd-popup>
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
.shipping-popup { padding: 32rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); background: #fff; }
.shipping-title { display: block; font-size: 32rpx; font-weight: 700; color: #1d2129; }
.shipping-order { display: block; margin: 12rpx 0 20rpx; font-size: 22rpx; color: #86909c; font-family: ui-monospace, monospace; }
</style>
