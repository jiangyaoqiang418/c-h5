<script setup lang="ts">
import { ref, watch } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { fetchBoughtOrders, fetchSoldOrders, cancelRealOrder, confirmRealOrder, payRealOrderGroup, shipRealOrder, uploadOrderVoucher } from '@/service/api/order';
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
const shippingForm = ref<{ carrier: Api.RealOrder.CarrierType; carrierName: string; trackingNo: string; purchaseNo: string; remark: string }>({ carrier: 'SF', carrierName: '', trackingNo: '', purchaseNo: '', remark: '' });
const purchaseVouchers = ref<string[]>([]);
const shipVouchers = ref<string[]>([]);
const voucherUploading = ref(false);

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
  shippingForm.value = { carrier: 'SF', carrierName: '', trackingNo: '', purchaseNo: '', remark: '' };
  purchaseVouchers.value = [];
  shipVouchers.value = [];
  shippingPopupVisible.value = true;
}

async function chooseVouchers(kind: 'purchase' | 'ship') {
  if (!shippingOrder.value || voucherUploading.value) return;
  const target = kind === 'purchase' ? purchaseVouchers : shipVouchers;
  const count = 6 - target.value.length;
  if (count <= 0) return;
  try {
    const picked = await uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const filePaths = Array.isArray(picked.tempFilePaths) ? picked.tempFilePaths : [picked.tempFilePaths];
    voucherUploading.value = true;
    for (let index = 0; index < filePaths.length; index += 1) {
      uni.showLoading({ title: `上传中 ${index + 1}/${filePaths.length}` });
      target.value.push((await uploadOrderVoucher(filePaths[index], shippingOrder.value.id)).url);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '凭证上传失败');
    if (!message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally {
    voucherUploading.value = false;
    uni.hideLoading();
  }
}

function removeVoucher(kind: 'purchase' | 'ship', index: number) {
  (kind === 'purchase' ? purchaseVouchers : shipVouchers).value.splice(index, 1);
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
      purchaseNo: shippingForm.value.purchaseNo.trim() || undefined,
      purchaseVouchers: purchaseVouchers.value,
      shipVouchers: shipVouchers.value,
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
  <view class="order-list-page yb-page">
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
      <view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载订单</text></view>
      <EmptyState v-else title="该状态下没有订单" description="完成购物后这里会显示" />
    </view>

    <wd-popup v-model="shippingPopupVisible" position="bottom" :safe-area-inset-bottom="true">
      <view class="shipping-popup">
        <text class="shipping-title">填写发货信息</text>
        <text v-if="shippingOrder" class="shipping-order">订单 {{ shippingOrder.code }}</text>
        <wd-cell title="承运商"><wd-radio-group v-model="shippingForm.carrier" inline><wd-radio value="SF">顺丰</wd-radio><wd-radio value="JD">京东</wd-radio><wd-radio value="EMS">EMS</wd-radio><wd-radio value="YTO">圆通</wd-radio><wd-radio value="ZTO">中通</wd-radio><wd-radio value="OTHER">其他</wd-radio></wd-radio-group></wd-cell>
        <wd-input v-if="shippingForm.carrier === 'OTHER'" v-model="shippingForm.carrierName" label="承运商名称" placeholder="请输入" />
        <wd-input v-model="shippingForm.trackingNo" label="运单号" placeholder="请输入真实运单号" />
        <wd-input v-model="shippingForm.purchaseNo" label="采购单号" placeholder="可选，海外采购单号" />
        <view class="voucher-field"><text class="voucher-label">采购凭证（可选，最多 6 张）</text><view class="voucher-grid"><view v-for="(url, index) in purchaseVouchers" :key="url" class="voucher-cell"><image :src="url" mode="aspectFill" class="voucher-image" /><view class="voucher-remove" @click="removeVoucher('purchase', index)"><wd-icon name="close" size="12px" color="#fff" /></view></view><view v-if="purchaseVouchers.length < 6" class="voucher-add" @click="chooseVouchers('purchase')"><wd-icon name="add" size="20px" /><text>{{ voucherUploading ? '上传中' : '添加' }}</text></view></view></view>
        <view class="voucher-field"><text class="voucher-label">发货凭证（可选，最多 6 张）</text><view class="voucher-grid"><view v-for="(url, index) in shipVouchers" :key="url" class="voucher-cell"><image :src="url" mode="aspectFill" class="voucher-image" /><view class="voucher-remove" @click="removeVoucher('ship', index)"><wd-icon name="close" size="12px" color="#fff" /></view></view><view v-if="shipVouchers.length < 6" class="voucher-add" @click="chooseVouchers('ship')"><wd-icon name="add" size="20px" /><text>{{ voucherUploading ? '上传中' : '添加' }}</text></view></view></view>
        <wd-input v-model="shippingForm.remark" label="发货备注" placeholder="可选" />
        <wd-button type="primary" block :loading="shippingSubmitting" @click="submitShipping">确认发货</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.order-list-page { min-height:100%; padding-bottom:32rpx; }
.list {
  padding: 24rpx;
}
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.shipping-popup { padding: 32rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); background: #fff; }
.shipping-title { display: block; font-size: 32rpx; font-weight: 700; color: #1d2129; }
.shipping-order { display: block; margin: 12rpx 0 20rpx; font-size: 22rpx; color: #86909c; font-family: ui-monospace, monospace; }
.voucher-field { padding:20rpx 32rpx; }.voucher-label { display:block; margin-bottom:12rpx; color:#4e5969; font-size:26rpx; }.voucher-grid { display:flex; flex-wrap:wrap; gap:12rpx; }.voucher-cell,.voucher-add { width:160rpx; height:160rpx; }.voucher-cell { position:relative; }.voucher-image { width:100%; height:100%; border-radius:var(--yb-radius-md); }.voucher-remove { position:absolute; top:4rpx; right:4rpx; display:flex; align-items:center; justify-content:center; width:36rpx; height:36rpx; border-radius:50%; background:rgba(0,0,0,.55); }.voucher-add { display:flex; flex-direction:column; gap:6rpx; align-items:center; justify-content:center; box-sizing:border-box; border:2rpx dashed #c9cdd4; border-radius:var(--yb-radius-md); background:#f7f8fa; color:#86909c; font-size:20rpx; }
</style>
