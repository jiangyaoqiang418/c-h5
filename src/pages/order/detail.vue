<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import { cancelRealOrder, confirmRealOrder, createOrderLogisticsTrack, fetchOrderDetail, fetchOrderLogistics, markOrderLogisticsException, payRealOrderGroup } from '@/service/api/order';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import OrderStatusTag from '@/components/order/order-status-tag.vue';
import OrderTimeline from '@/components/order/order-timeline.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { go, requireLogin } from '@/utils/navigate';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const order = ref<Api.RealOrder.OrderView>();
const id = ref<Api.RealOrder.LongId>();
const logistics = ref<Api.RealOrder.LogisticsDTO>();
const trackPopupVisible = ref(false);
const exceptionPopupVisible = ref(false);
const logisticsSubmitting = ref(false);
const trackForm = ref<{ status: Api.RealOrder.LogisticsStatus; description: string; location: string; exceptionNode: boolean }>({ status: 'IN_TRANSIT', description: '', location: '', exceptionNode: false });
const exceptionForm = ref({ exception: '', location: '' });

onLoad(async query => {
  id.value = query?.id ? String(query.id) : undefined;
  await userStore.init();
  if (id.value && userStore.currentUser) {
    const scope = userStore.isBuyerActive ? 'sold' : 'bought';
    const [detailResult, logisticsResult] = await Promise.allSettled([fetchOrderDetail(id.value, scope), fetchOrderLogistics(id.value)]);
    if (detailResult.status === 'fulfilled') order.value = detailResult.value;
    else uni.showToast({ title: detailResult.reason instanceof Error ? detailResult.reason.message : '订单详情加载失败', icon: 'none' });
    if (logisticsResult.status === 'fulfilled') logistics.value = logisticsResult.value;
  } else if (id.value) {
    await requireLogin(`/pages/order/detail?id=${encodeURIComponent(String(id.value))}`);
  }
});

async function reload() {
  if (id.value) {
    const scope = userStore.isBuyerActive ? 'sold' : 'bought';
    const [detailResult, logisticsResult] = await Promise.allSettled([fetchOrderDetail(id.value, scope), fetchOrderLogistics(id.value)]);
    if (detailResult.status === 'fulfilled') order.value = detailResult.value;
    else uni.showToast({ title: detailResult.reason instanceof Error ? detailResult.reason.message : '订单详情加载失败', icon: 'none' });
    if (logisticsResult.status === 'fulfilled') logistics.value = logisticsResult.value;
  }
}

async function pay() {
  if (!order.value) return;
  if (!order.value.orderGroupNo) {
    uni.showToast({ title: '订单组信息缺失，暂无法继续付款', icon: 'none' });
    return;
  }
  uni.showModal({
    title: '确认付款？',
    content: '将支付该订单组内全部待付款订单。',
    success: async result => {
      if (!result.confirm || !order.value?.orderGroupNo) return;
      await payRealOrderGroup({ orderGroupNo: order.value.orderGroupNo });
      uni.showToast({ title: '支付成功', icon: 'success' });
      await reload();
    }
  });
}

function cancel() {
  if (!order.value) return;
  uni.showModal({
    title: '取消订单？',
    success: async r => {
      if (r.confirm) {
        await cancelRealOrder({ id: order.value!.id, reason: '顾客取消' });
        uni.showToast({ title: '订单已取消', icon: 'success' });
        await reload();
      }
    }
  });
}

function confirm() {
  if (!order.value) return;
  uni.showModal({
    title: '确认收货？',
    success: async r => {
      if (r.confirm) {
        await confirmRealOrder(order.value!.id);
        uni.showToast({ title: '已确认收货', icon: 'success' });
        await reload();
      }
    }
  });
}

function goIm() {
  if (order.value) go(`/pages/im/real-order-group?orderId=${encodeURIComponent(String(order.value.id))}`);
}

function goAftersale() {
  if (order.value) go(`/pages/aftersale/create?orderId=${order.value.id}`);
}

function goReview() {
  if (order.value) go(`/pages/review/write?orderId=${encodeURIComponent(String(order.value.id))}`);
}

function openTrackPopup() {
  trackForm.value = { status: 'IN_TRANSIT', description: '', location: '', exceptionNode: false };
  trackPopupVisible.value = true;
}

function openExceptionPopup() {
  exceptionForm.value = { exception: '', location: '' };
  exceptionPopupVisible.value = true;
}

async function submitTrack() {
  if (!id.value || !trackForm.value.description.trim()) {
    uni.showToast({ title: '请填写轨迹说明', icon: 'none' });
    return;
  }
  logisticsSubmitting.value = true;
  try {
    await createOrderLogisticsTrack({
      orderId: id.value,
      occurredAt: Date.now(),
      status: trackForm.value.status,
      description: trackForm.value.description.trim(),
      location: trackForm.value.location.trim() || undefined,
      exceptionNode: trackForm.value.exceptionNode
    });
    trackPopupVisible.value = false;
    uni.showToast({ title: '物流轨迹已更新', icon: 'success' });
    await reload();
  } finally {
    logisticsSubmitting.value = false;
  }
}

async function submitException() {
  if (!id.value || !exceptionForm.value.exception.trim()) {
    uni.showToast({ title: '请填写异常说明', icon: 'none' });
    return;
  }
  logisticsSubmitting.value = true;
  try {
    await markOrderLogisticsException({
      orderId: id.value,
      exception: exceptionForm.value.exception.trim(),
      location: exceptionForm.value.location.trim() || undefined
    });
    exceptionPopupVisible.value = false;
    uni.showToast({ title: '物流异常已标记', icon: 'success' });
    await reload();
  } finally {
    logisticsSubmitting.value = false;
  }
}
</script>

<template>
  <view v-if="order" class="detail-page yb-page">
    <view class="hero">
      <OrderStatusTag :status="order.status" />
      <text class="code">{{ order.code }}</text>
      <text v-if="order.createdAt" class="time">{{ new Date(order.createdAt).toLocaleString() }}</text>
    </view>

    <view class="section">
      <text class="section-title">订单进度</text>
      <OrderTimeline :order="order" />
    </view>

    <view class="section">
      <text class="section-title">收货地址</text>
      <text class="addr-name">{{ order.receiverName }} · {{ order.receiverPhone }}</text>
      <view class="addr-detail"><wd-icon name="location" size="15px" /><text>{{ order.shippingAddress }}</text></view>
    </view>

    <view class="section goods">
      <text class="section-title">商品信息</text>
      <view class="goods-row">
        <image :src="order.productCover || UI_ASSETS.placeholders.product" mode="aspectFill" class="cover" />
        <view class="goods-info">
          <text class="g-title">{{ order.productTitle }}</text>
          <text class="g-seller">{{ order.counterpartLabel }} · {{ order.counterpartName }}</text>
        </view>
        <view class="g-price-block">
          <text class="g-price-cny">{{ formatUsdt(order.price) }}</text>
          <text class="g-price-usdt">≈ {{ formatCny(order.price) }}</text>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">金额明细</text>
      <view class="amt-row">
        <text class="amt-lbl">商品</text>
        <view class="amt-val">
          <text class="amt-cny">{{ formatUsdt(order.price) }}</text>
          <text class="amt-usdt">≈ {{ formatCny(order.price) }}</text>
        </view>
      </view>
      <view class="amt-row">
        <text class="amt-lbl">运费</text>
        <view class="amt-val">
          <text class="amt-cny">{{ formatUsdt(order.shippingFee) }}</text>
        </view>
      </view>
      <view class="amt-row">
        <view class="amt-lbl">税费 <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="22" /></view>
        <view class="amt-val">
          <text class="amt-cny">{{ formatUsdt(order.tax) }}</text>
        </view>
      </view>
      <view class="amt-row total">
        <text class="amt-lbl">合计</text>
        <view class="amt-val">
          <text class="amt-cny amt-big">{{ formatUsdt(order.totalAmount) }}</text>
          <text class="amt-usdt">≈ {{ formatCny(order.totalAmount) }} · {{ priceSet(order.totalAmount).rateLabel }}</text>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">三方群 / 客服</text>
      <view class="link-row" @click="goIm">
        <wd-icon name="chat" size="21px" />
        <text class="link-label">打开三方群</text>
        <wd-icon name="arrow-right" size="16px" color="#a6a9b1" />
      </view>
    </view>

    <view v-if="logistics" class="section">
      <text class="section-title">物流信息</text>
      <view class="amt-row"><text class="amt-lbl">状态</text><text>{{ logistics.logisticsStatusText || logistics.logisticsStatus || '待发货' }}</text></view>
       <view v-if="logistics.carrierName || logistics.carrier" class="amt-row"><text class="amt-lbl">承运商</text><text>{{ logistics.carrierName || logistics.carrier }}</text></view>
       <view v-if="logistics.trackingNo" class="amt-row"><text class="amt-lbl">运单号</text><text>{{ logistics.trackingNo }}</text></view>
       <view v-if="logistics.purchaseNo" class="amt-row"><text class="amt-lbl">采购单号</text><text>{{ logistics.purchaseNo }}</text></view>
       <view v-if="logistics.eta" class="amt-row"><text class="amt-lbl">预计送达</text><text>{{ new Date(Number(logistics.eta)).toLocaleString() }}</text></view>
       <text v-if="logistics.logisticsException" class="logistics-exception">物流异常：{{ logistics.logisticsException }}</text>
       <view v-if="logistics.purchaseVouchers.length" class="voucher-section"><text class="voucher-title">采购凭证</text><view class="voucher-grid"><image v-for="(url, index) in logistics.purchaseVouchers" :key="`${url}-${index}`" :src="url" mode="aspectFill" class="voucher-image" /></view></view>
       <view v-if="logistics.shipVouchers.length" class="voucher-section"><text class="voucher-title">发货凭证</text><view class="voucher-grid"><image v-for="(url, index) in logistics.shipVouchers" :key="`${url}-${index}`" :src="url" mode="aspectFill" class="voucher-image" /></view></view>
       <view v-if="logistics.tracks.length" class="tracks"><view v-for="track in logistics.tracks" :key="String(track.trackId)" class="track"><text>{{ track.statusText || track.status }} · {{ track.description }}</text><text v-if="track.location || track.occurredAt" class="track-meta">{{ track.location || '' }} {{ track.occurredAt ? new Date(Number(track.occurredAt)).toLocaleString() : '' }}</text></view></view>
       <text v-else class="track-meta">暂无物流轨迹</text>
       <view v-if="userStore.isBuyerActive && order.status === 'IN_TRANSIT'" class="logistics-actions">
         <wd-button size="small" plain @click="openTrackPopup">更新物流轨迹</wd-button>
         <wd-button size="small" type="error" plain @click="openExceptionPopup">标记物流异常</wd-button>
       </view>
     </view>

    <wd-popup v-model="trackPopupVisible" position="bottom" :safe-area-inset-bottom="true">
      <view class="logistics-popup">
        <text class="popup-title">更新物流轨迹</text>
        <wd-cell title="物流状态"><wd-radio-group v-model="trackForm.status" inline><wd-radio value="IN_TRANSIT">运输中</wd-radio><wd-radio value="DELIVERING">派送中</wd-radio><wd-radio value="SIGNED">已签收</wd-radio><wd-radio value="EXCEPTION">异常</wd-radio></wd-radio-group></wd-cell>
        <wd-input v-model="trackForm.description" label="轨迹说明" placeholder="例如：包裹已到达转运中心" />
        <wd-input v-model="trackForm.location" label="当前位置" placeholder="可选" />
        <wd-cell title="异常节点"><wd-switch v-model="trackForm.exceptionNode" /></wd-cell>
        <wd-button type="primary" block :loading="logisticsSubmitting" @click="submitTrack">提交轨迹</wd-button>
      </view>
    </wd-popup>

    <wd-popup v-model="exceptionPopupVisible" position="bottom" :safe-area-inset-bottom="true">
      <view class="logistics-popup">
        <text class="popup-title">标记物流异常</text>
        <wd-input v-model="exceptionForm.exception" label="异常说明" placeholder="请说明异常情况" />
        <wd-input v-model="exceptionForm.location" label="当前位置" placeholder="可选" />
        <wd-button type="error" block :loading="logisticsSubmitting" @click="submitException">确认标记</wd-button>
      </view>
    </wd-popup>

    <view class="actions-bar">
      <wd-button v-if="order.status === 'PENDING_PAYMENT'" type="primary" @click="pay">立即付款</wd-button>
      <wd-button v-if="order.status === 'PENDING_PAYMENT'" plain @click="cancel">取消订单</wd-button>
      <wd-button v-if="order.status === 'IN_TRANSIT'" type="primary" @click="confirm">确认收货</wd-button>
      <wd-button v-if="order.status === 'COMPLETED'" plain @click="goReview">写评价</wd-button>
      <wd-button v-if="['PROCURING', 'IN_TRANSIT'].includes(order.status)" plain @click="goAftersale">申请仅退款</wd-button>
    </view>
  </view>
  <EmptyState v-else title="订单不存在" />
</template>

<style lang="scss" scoped>
.detail-page { min-height:100%; padding:20rpx 24rpx calc(164rpx + env(safe-area-inset-bottom)); }
.hero {
  background: linear-gradient(135deg, #fff 0%, #fff4f4 100%);
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.code {
  font-family: ui-monospace, monospace;
  font-size: 28rpx;
  color: #1d2129;
}
.time {
  font-size: 22rpx;
  color: #86909c;
}
.section {
  background: #fff;
  margin-top: 20rpx;
  padding: 24rpx 32rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.section-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 16rpx;
}
.addr-name {
  display: block;
  font-size: 28rpx;
  font-weight: 500;
}
.addr-detail {
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
  font-size: 24rpx;
  color: #4e5969;
  margin-top: 4rpx;
}
.goods-row {
  display: flex;
  gap: 16rpx;
}
.cover {
  width: 120rpx;
  height: 120rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}
.goods-info {
  flex: 1;
}
.g-title {
  display: block;
  font-size: 26rpx;
}
.g-seller {
  display: block;
  font-size: 22rpx;
  color: #86909c;
  margin: 4rpx 0;
}
.g-price {
  color: #f53f3f;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.amt-row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 24rpx;
  color: #4e5969;
}
.amt-row.total {
  font-weight: 700;
  color: #f53f3f;
  font-size: 28rpx;
  border-top: 1rpx dashed #f2f3f5;
  margin-top: 8rpx;
  padding-top: 16rpx;
}
.link-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 0;
}
.link-label {
  flex: 1;
  font-size: 26rpx;
  color: #1d2129;
}
.logistics-exception { display:block; margin-top:12rpx; padding:16rpx; color:#f53f3f; background:#fff2f0; font-size:24rpx; line-height:1.5; }.tracks { margin-top:12rpx; }.track { padding:14rpx 0; border-top:1rpx solid #f2f3f5; font-size:24rpx; color:#1d2129; }.track-meta { display:block; margin-top:6rpx; color:#86909c; font-size:21rpx; }
.voucher-section { margin-top:20rpx; }.voucher-title { display:block; margin-bottom:12rpx; color:#4e5969; font-size:24rpx; }.voucher-grid { display:flex; flex-wrap:wrap; gap:12rpx; }.voucher-image { width:160rpx; height:160rpx; border-radius:8rpx; }
.logistics-actions { display:flex; justify-content:flex-end; gap:12rpx; margin-top:20rpx; }.logistics-popup { padding:32rpx 24rpx calc(32rpx + env(safe-area-inset-bottom)); background:#fff; }.popup-title { display:block; margin-bottom:20rpx; color:#1d2129; font-size:32rpx; font-weight:700; }
.actions-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1rpx solid #f2f3f5;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  display: flex;
  gap: 12rpx;
  justify-content: flex-end;
}
</style>
