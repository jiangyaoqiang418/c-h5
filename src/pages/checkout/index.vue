<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { addressApi, orderApi, walletApi } from '@shared';
import type { AddressRecord } from '@shared/api/address';
import { formatCny, formatUsdt, priceSet, TAX_TOOLTIP_TEXT } from '@shared/utils/currency';
import { formatAmount } from '@/utils/format-bridge';
import InfoTooltip from '@/components/common/info-tooltip.vue';
import { go, reLaunch } from '@/utils/navigate';
import { useCartStore, useUserStore } from '@/stores';

const userStore = useUserStore();
const cart = useCartStore();

const addresses = ref<AddressRecord[]>([]);
const selectedAddrId = ref<number>();
const wallet = ref<Api.User.WalletSummary>();
const agreed = ref(false);
const submitting = ref(false);

const items = computed(() => cart.selectedItems);

onMounted(async () => {
  if (!userStore.currentUser) {
    go('/pages/auth/login?redirect=' + encodeURIComponent('/pages/checkout/index'));
    return;
  }
  if (items.value.length === 0) {
    uni.showToast({ title: '请先选择商品', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
    return;
  }
  addresses.value = await addressApi.fetchMyAddresses(userStore.currentUser.id);
  if (addresses.value.length) {
    const def = addresses.value.find(a => a.isDefault) || addresses.value[0];
    selectedAddrId.value = def.id;
  }
  wallet.value = await walletApi.fetchMyWallet(userStore.currentUser.id);
});

const selectedAddr = computed(() => addresses.value.find(a => a.id === selectedAddrId.value));
const available = computed(() => Number(wallet.value?.available || 0));
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
    const userId = userStore.currentUser!.id;
    const addr = selectedAddr.value;
    let firstId: number | undefined;
    for (const item of items.value) {
      if (
        !item.product
        || item.source !== 'mock'
        || typeof item.productId !== 'number'
        || typeof item.product.sellerId !== 'number'
      ) continue;
      const order = await orderApi.createOrderMock({
        customerId: userId,
        productId: item.productId,
        shopperId: item.product.sellerId,
        productTitle: item.product.title,
        productCover: item.product.cover,
        price: (Number(item.product.price) * item.qty).toFixed(2),
        shippingFee: String(item.product.shippingFee),
        tax: String(item.product.tax),
        receiverName: addr.receiverName,
        receiverPhone: addr.receiverPhone,
        shippingAddress: `${addr.province}${addr.city}${addr.district}${addr.detail}`,
        aftersaleType: item.product.aftersaleType
      });
      const pr = await orderApi.payOrderMock(order.id);
      if (!pr.ok) {
        uni.showToast({ title: pr.message || '支付失败', icon: 'none' });
        return;
      }
      if (firstId == null) firstId = order.id;
      cart.remove(item.key);
    }
    uni.showToast({ title: '支付成功', icon: 'success' });
    if (firstId) reLaunch(`/pages/checkout/success?orderId=${firstId}`);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="checkout-page">
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
          :src="item.product?.cover || `https://picsum.photos/seed/${item.productId}/120/120`"
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
        <text class="am-lbl">税费 <InfoTooltip :text="TAX_TOOLTIP_TEXT" :size="22" /></text>
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
        <text>钱包余额：U {{ formatAmount(available.toFixed(2)) }}</text>
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
      <wd-button type="primary" size="large" :loading="submitting" :disabled="!agreed" @click="submit">提交订单</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.checkout-page {
  min-height: 100%;
  background: #f7f8fa;
  padding-bottom: calc(144rpx + env(safe-area-inset-bottom));
}
.block {
  background: #fff;
  margin-bottom: 16rpx;
  padding: 24rpx;
}
.block-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 16rpx;
  padding-left: 16rpx;
  border-left: 6rpx solid #4d80f0;
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
.pay-row {
  font-size: 26rpx;
  color: #1d2129;
}
.insufficient {
  color: #f53f3f;
  margin-left: 8rpx;
}
.agree-row {
  background: #fff;
  padding: 24rpx;
  font-size: 24rpx;
}
.footer-space { display: none; }
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1rpx solid #f2f3f5;
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
