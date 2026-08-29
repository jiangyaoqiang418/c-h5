<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import { formatAmount } from '@/utils/format-bridge';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { go, reLaunch } from '@/utils/navigate';
import { fetchMyAddresses, type AddressRecord } from '@/service/api/address';
import { createBatchOrder, payRealOrderGroup } from '@/service/api/order';
import { useCartStore, useUserStore, useWalletStore } from '@/stores';
import { storage } from '@/utils/storage';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const cart = useCartStore();
const walletStore = useWalletStore();

const addresses = ref<AddressRecord[]>([]);
const selectedAddrId = ref<Api.RealAddress.LongId>();
const agreed = ref(false);
const submitting = ref(false);
const loading = ref(false);
const loadFailed = ref(false);

const items = computed(() => cart.selectedItems);
const hasMockItems = computed(() => items.value.some(item => item.source !== 'real'));
const hasOnlyRealItems = computed(() => items.value.length > 0 && !hasMockItems.value);

interface PendingCheckout {
  fingerprint: string;
  idempotencyKey: string;
  orderGroupNo?: string;
  orderIds?: Api.RealOrder.LongId[];
}

const pendingKey = 'bw_h5_real_checkout_pending_v1';

function checkoutFingerprint() {
  return [
    String(userStore.realUserId || ''),
    String(selectedAddrId.value || ''),
    ...items.value.map(item => `${item.key}:${item.qty}`).sort()
  ].join('|');
}

function createIdempotencyKey() {
  return `h5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readPending(fingerprint: string): PendingCheckout {
  const pending = storage.get<PendingCheckout | undefined>(pendingKey);
  if (pending?.fingerprint === fingerprint && pending.idempotencyKey) return pending;
  const next = { fingerprint, idempotencyKey: createIdempotencyKey() };
  storage.set(pendingKey, next);
  return next;
}

async function loadCheckout() {
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      go('/pages/auth/login?redirect=' + encodeURIComponent('/pages/checkout/index'));
      return;
    }
    if (items.value.length === 0) {
      uni.showToast({ title: '请先选择商品', icon: 'none' });
      setTimeout(() => uni.navigateBack(), 800);
      return;
    }
    addresses.value = await fetchMyAddresses();
    if (addresses.value.length) {
      const def = addresses.value.find(a => a.isDefault) || addresses.value[0];
      selectedAddrId.value = def.id;
    }
    await walletStore.fetchWallet();
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '结算信息加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}
onShow(loadCheckout);

const selectedAddr = computed(() => addresses.value.find(a => a.id === selectedAddrId.value));
const available = computed(() => Number(walletStore.summary?.available || 0));
const balanceEnough = computed(() => available.value >= Number(cart.grandTotal));

async function submit() {
  if (!agreed.value) {
    uni.showToast({ title: '请阅读并同意协议', icon: 'none' });
    return;
  }
  if (!selectedAddr.value) {
    uni.showToast({ title: '请选择收货地址', icon: 'none' });
    return;
  }
  if (!hasOnlyRealItems.value) {
    uni.showToast({ title: '请仅选择真实商品后结算', icon: 'none' });
    return;
  }
  if (!balanceEnough.value) {
    uni.showModal({
      title: '余额不足',
      content: '前往链上充值？',
      success: r => r.confirm && go('/pages/wallet/deposit')
    });
    return;
  }
  submitting.value = true;
  try {
    const fingerprint = checkoutFingerprint();
    const pending = readPending(fingerprint);
    if (!pending.orderGroupNo) {
      const group = await createBatchOrder({
        addressId: selectedAddr.value.id,
        items: items.value.map(item => ({ productId: item.productId, quantity: item.qty })),
        idempotencyKey: pending.idempotencyKey
      });
      pending.orderGroupNo = group.orderGroupNo;
      pending.orderIds = group.orderIds;
      storage.set(pendingKey, pending);
    }

    await payRealOrderGroup({ orderGroupNo: pending.orderGroupNo });
    items.value.forEach(item => cart.remove(item.key));
    storage.remove(pendingKey);
    await walletStore.refetch();
    uni.showToast({ title: '支付成功', icon: 'success' });
    const firstId = pending.orderIds?.[0];
    if (firstId !== undefined) reLaunch(`/pages/checkout/success?orderId=${encodeURIComponent(String(firstId))}`);
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '订单提交失败，请稍后重试',
      icon: 'none'
    });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="checkout-page yb-page">
    <view v-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载结算信息</text></view>
    <EmptyState v-else-if="loadFailed" title="结算信息加载失败" description="请稍后重试" />
    <template v-else>
    <view class="block">
      <text class="block-title">1. 收货地址</text>
      <view v-if="selectedAddr" class="addr">
        <text class="receiver">{{ selectedAddr.receiverName }} · {{ selectedAddr.receiverPhone }}</text>
        <text class="detail">{{ selectedAddr.province }} {{ selectedAddr.city }} {{ selectedAddr.district }} {{ selectedAddr.detail }}</text>
        <wd-button plain size="small" @click="go('/pages/my/addresses')">更换地址</wd-button>
      </view>
      <view v-else class="addr empty">
        <text>暂无地址</text>
        <wd-button type="primary" size="small" @click="go('/pages/my/addresses')">新增地址</wd-button>
      </view>
    </view>

    <view class="block">
      <text class="block-title">2. 商品清单 ({{ items.length }})</text>
      <view v-for="item in items" :key="item.key" class="goods-row">
        <image
          :src="item.product?.cover || UI_ASSETS.placeholders.product"
          class="goods-cover"
          mode="aspectFill"
        />
        <view class="goods-info">
          <text class="goods-title">{{ item.product?.title }}</text>
          <text class="goods-seller">买手 · {{ item.product?.sellerName }}</text>
        </view>
        <view class="goods-amount">
          <text class="goods-qty">×{{ item.qty }}</text>
          <text class="goods-price-cny">{{ formatUsdt(item.lineTotal) }}</text>
          <text class="goods-price-usdt">≈ {{ formatCny(item.lineTotal) }}</text>
        </view>
      </view>
    </view>

    <view class="block">
      <text class="block-title">3. 金额明细</text>
      <view class="amount-row">
        <text class="am-lbl">商品合计</text>
        <view class="am-val">
          <text class="am-cny">{{ formatUsdt(cart.subTotal) }}</text>
          <text class="am-usdt">≈ {{ formatCny(cart.subTotal) }}</text>
        </view>
      </view>
      <view class="amount-row">
        <text class="am-lbl">运费</text>
        <view class="am-val">
          <text class="am-cny">{{ formatUsdt(cart.shippingFeeTotal) }}</text>
        </view>
      </view>
      <view class="amount-row">
        <view class="am-lbl with-tip"><text>税费</text><InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="22" /></view>
        <view class="am-val">
          <text class="am-cny">{{ formatUsdt(cart.taxTotal) }}</text>
        </view>
      </view>
      <view class="amount-row total">
        <text class="am-lbl">应付总额</text>
        <view class="am-val">
          <text class="am-cny total-big">{{ formatUsdt(cart.grandTotal) }}</text>
          <text class="am-usdt">≈ {{ formatCny(cart.grandTotal) }} · {{ priceSet(cart.grandTotal).rateLabel }}</text>
        </view>
      </view>
    </view>

    <view class="block">
      <text class="block-title">4. 支付方式</text>
      <view class="pay-row">
        <text>钱包可用余额：U {{ formatAmount(available.toFixed(2)) }}</text>
        <text v-if="!balanceEnough" class="insufficient">· 余额不足</text>
      </view>
    </view>

    <view class="agree-row">
      <wd-checkbox v-model="agreed" shape="square">
        <text>我已阅读并同意《用户协议》《隐私政策》</text>
      </wd-checkbox>
    </view>

    <view class="footer-space" />

    <view class="bottom-bar">
      <view class="total-block">
        <text class="total-label">应付：</text>
        <text class="total-val">{{ formatUsdt(cart.grandTotal) }}</text>
        <text class="total-usdt">≈ {{ formatCny(cart.grandTotal) }}</text>
      </view>
      <wd-button type="primary" size="large" :loading="submitting" :disabled="!agreed || !hasOnlyRealItems" @click="submit">提交订单</wd-button>
    </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.checkout-page { min-height:100%; padding:20rpx 24rpx calc(164rpx + env(safe-area-inset-bottom)); }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
.block {
  background: #fff;
  margin-bottom: 20rpx;
  padding: 24rpx;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.block-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 16rpx;
  padding-left: 16rpx;
  border-left: 6rpx solid var(--yb-brand);
}
.addr {
  padding: 16rpx 0;
}
.addr.empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.receiver {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
}
.detail {
  display: block;
  font-size: 24rpx;
  color: #4e5969;
  margin: 4rpx 0 12rpx;
}
.goods-row {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx dashed #f2f3f5;
}
.goods-row:last-child {
  border-bottom: none;
}
.goods-cover {
  width: 100rpx;
  height: 100rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}
.goods-info {
  flex: 1;
  min-width: 0;
}
.goods-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 24rpx;
  color: #1d2129;
}
.goods-seller {
  display: block;
  font-size: 20rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.goods-amount {
  text-align: right;
  font-size: 24rpx;
  color: #4e5969;
}
.goods-price {
  display: block;
  color: #f53f3f;
  font-weight: 700;
  margin-top: 4rpx;
}
.amount-row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 24rpx;
  color: #4e5969;
}
.amount-row.total {
  font-weight: 700;
  color: #f53f3f;
  font-size: 28rpx;
  border-top: 1rpx dashed #f2f3f5;
  margin-top: 8rpx;
  padding-top: 16rpx;
}
.with-tip { display: flex; align-items: center; gap: 4rpx; }
.pay-row {
  font-size: 26rpx;
  color: #1d2129;
}
.insufficient {
  color: #f53f3f;
  margin-left: 8rpx;
}
.agree-row { background:#fff; padding:24rpx; font-size:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }
.footer-space { display: none; }
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1rpx solid var(--yb-border);
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}
.total-block {
  flex: 1;
}
.total-label {
  font-size: 24rpx;
  color: #4e5969;
}
.total-val {
  font-size: 36rpx;
  font-weight: 700;
  color: #f53f3f;
  font-family: ui-monospace, monospace;
}
</style>
