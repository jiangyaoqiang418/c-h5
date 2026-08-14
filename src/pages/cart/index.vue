<script setup lang="ts">
import { computed } from 'vue';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import { go, requireLogin } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useCartStore } from '@/stores';

const cart = useCartStore();
const items = computed(() => cart.enrichedItems);

function setAll(v: boolean) {
  cart.setAllSelected(v);
}

function remove(key: string) {
  uni.showModal({
    title: '从购物车移除？',
    success: r => r.confirm && cart.remove(key)
  });
}

async function goCheckout() {
  if (cart.selectedQty === 0) {
    uni.showToast({ title: '请先勾选商品', icon: 'none' });
    return;
  }
  if (cart.selectedItems.some(item => item.source === 'real')) {
    uni.showToast({ title: '真实商品订单正在接入，请先取消勾选', icon: 'none' });
    return;
  }
  if (await requireLogin('/pages/cart/index')) go('/pages/checkout/index');
}
</script>

<template>
  <view class="cart-page h5-tab-page" :class="{ 'has-items': items.length > 0 }">
    <template v-if="items.length">
      <view class="list">
        <view v-for="item in items" :key="item.key" class="row" :class="{ invalid: !item.available }">
          <view class="check" @click="cart.setSelected(item.key, !item.selected)">
            <text class="dot" :class="{ on: item.selected }">{{ item.selected ? '✓' : '' }}</text>
          </view>
          <image
            v-if="item.product"
            :src="item.product.cover || `https://picsum.photos/seed/${item.productId}/200/200`"
            mode="aspectFill"
            class="cover"
          />
          <view class="info">
            <text class="title">{{ item.product?.title || '商品已删除' }}</text>
            <text class="seller">{{ item.product?.sellerName || '—' }}</text>
            <view class="price-row">
              <view class="price-block">
                <text class="price-cny">{{ formatUsdt(item.product?.price || 0) }}</text>
                <text class="price-usdt">≈ {{ formatCny(item.product?.price || 0) }}</text>
              </view>
              <view class="qty">
                <text class="qty-btn" @click="cart.update(item.key, item.qty - 1)">-</text>
                <text class="qty-val">{{ item.qty }}</text>
                <text class="qty-btn" @click="cart.update(item.key, item.qty + 1)">+</text>
              </view>
            </view>
          </view>
          <text class="del" @click="remove(item.key)">✕</text>
        </view>
      </view>

      <view class="bottom-bar">
        <view class="all-check" @click="setAll(!cart.allSelected)">
          <text class="dot" :class="{ on: cart.allSelected }">{{ cart.allSelected ? '✓' : '' }}</text>
          <text class="label">全选</text>
        </view>
        <view class="amount-block">
          <text class="amount-label">合计</text>
          <text class="amount-cny">{{ formatUsdt(cart.grandTotal) }}</text>
          <text class="amount-usdt">≈ {{ formatCny(cart.grandTotal) }}</text>
        </view>
        <wd-button type="primary" :disabled="cart.selectedQty === 0" @click="goCheckout">结算</wd-button>
      </view>
    </template>

    <EmptyState
      v-else
      title="购物车空空如也"
      description="去首页发现喜欢的商品"
      action-text="去逛逛"
      @action="go('/pages/index/index')"
    />
  </view>
</template>

<style lang="scss" scoped>
.cart-page {
  min-height: 100%;
  background: #f7f8fa;
}
.cart-page.has-items {
  /* 仅预留结算栏本身的高度，tabBar 已由窗口层扣除。 */
  padding-bottom: calc(184rpx + env(safe-area-inset-bottom));
}
.list {
  padding: 16rpx;
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background: #fff;
  padding: 24rpx;
  border-radius: 16rpx;
  margin-bottom: 16rpx;
}
.row.invalid {
  opacity: 0.55;
}
.check {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dot {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2rpx solid #c9cdd4;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
}
.dot.on {
  border-color: #4d80f0;
  background: #4d80f0;
}
.cover {
  width: 140rpx;
  height: 140rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}
.info {
  flex: 1;
  min-width: 0;
}
.title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 26rpx;
  color: #1d2129;
  margin-bottom: 4rpx;
}
.seller {
  display: block;
  font-size: 20rpx;
  color: #86909c;
  margin-bottom: 12rpx;
}
.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.price-block {
  display: flex;
  flex-direction: column;
}
.price-cny {
  color: #0F111A;
  font-weight: 700;
  font-size: 30rpx;
  font-family: ui-monospace, monospace;
  letter-spacing: -0.5rpx;
  font-variant-numeric: tabular-nums;
}
.price-usdt {
  font-size: 20rpx;
  color: #6B7385;
  font-family: ui-monospace, monospace;
  margin-top: 2rpx;
}
.qty {
  display: flex;
  align-items: center;
  background: #f7f8fa;
  border-radius: 8rpx;
}
.qty-btn {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  color: #4e5969;
}
.qty-val {
  width: 56rpx;
  text-align: center;
  font-size: 24rpx;
}
.del {
  color: #c9cdd4;
  font-size: 32rpx;
  padding: 8rpx;
}
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 16rpx 40rpx calc(16rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 16rpx;
  border-top: 1rpx solid #f2f3f5;
}
/* #ifdef H5 */
.bottom-bar { bottom: 50px; }
/* #endif */
.all-check {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 12rpx;
}
.all-check .label {
  font-size: 24rpx;
}
.amount-block {
  flex: 1;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.amount-label {
  font-size: 20rpx;
  color: #6B7385;
}
.amount-cny {
  color: #0F111A;
  font-weight: 700;
  font-size: 34rpx;
  font-family: ui-monospace, monospace;
  letter-spacing: -0.5rpx;
  font-variant-numeric: tabular-nums;
}
.amount-usdt {
  font-size: 20rpx;
  color: #6B7385;
  font-family: ui-monospace, monospace;
}
.meta {
  display: block;
  font-size: 20rpx;
  color: #86909c;
  margin-top: 4rpx;
}
</style>
