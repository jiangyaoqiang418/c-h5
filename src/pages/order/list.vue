<script setup lang="ts">
import { ref, watch } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { fetchBoughtOrders, fetchSoldOrders, cancelRealOrder, confirmRealOrder, payRealOrderGroup, shipRealOrder } from '@/service/api/order';
import OrderCard from '@/components/order/order-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { go } from '@/utils/navigate';

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
const shippingForm = ref<{ carrier: Api.RealOrder.CarrierType; carrierName: string; trackingNo: string; remark: string }>({ carrier: 'SF', carrierName: '', trackingNo: '', remark: '' });

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

function pay(o: Api.RealOrder.OrderView) {
  if (!o.orderGroupNo) {
    uni.showToast({ title: '订单组信息缺失，暂无法继续付款', icon: 'none' });
    return;
  }
  uni.showModal({
    title: '确认付款？',
    content: '将支付该订单组内全部待付款订单。',
    success: async result => {
      if (!result.confirm) return;
      await payRealOrderGroup({ orderGroupNo: o.orderGroupNo! });
      uni.showToast({ title: '支付成功', icon: 'success' });
      await load();
    }
  });
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
  go(`/pages/review/write?orderId=${encodeURIComponent(String(o.id))}`);
}

function aftersale(o: Api.RealOrder.OrderView) {
  go(`/pages/aftersale/create?orderId=${o.id}`);
}

function openShipping(o: Api.RealOrder.OrderView) {
  shippingOrder.value = o;
  shippingForm.value = { carrier: 'SF', carrierName: '', trackingNo: '', remark: '' };
  shippingPopupVisible.value = true;
}

async function submitShipping() {
  if (!shippingOrder.value || !shippingForm.value.trackingNo.trim() || (shippingForm.value.carrier === 'OTHER' && !shippingForm.value.carrierName.trim())) {
    uni.showToast({ title: shippingForm.value.carrier === 'OTHER' ? '请填写承运商名称和运单号' : '请填写运单号', icon: 'none' });
    return;
  }
  shippingSubmitting.value = true;
  try {
    await shipRealOrder({
      id: shippingOrder.value.id,
      carrier: shippingForm.value.carrier,
      carrierName: shippingForm.value.carrier === 'OTHER' ? shippingForm.value.carrierName.trim() : undefined,
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
        <wd-cell title="承运商"><wd-radio-group v-model="shippingForm.carrier" inline><wd-radio value="SF">顺丰</wd-radio><wd-radio value="JD">京东</wd-radio><wd-radio value="EMS">EMS</wd-radio><wd-radio value="YTO">圆通</wd-radio><wd-radio value="ZTO">中通</wd-radio><wd-radio value="OTHER">其他</wd-radio></wd-radio-group></wd-cell>
        <wd-input v-if="shippingForm.carrier === 'OTHER'" v-model="shippingForm.carrierName" label="承运商名称" placeholder="请输入" />
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
