<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import { formatCny, formatUsdt } from '@shared/utils/currency';
import { go, useNavigationGuards } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useCartStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';

const { requireLogin } = useNavigationGuards();

const cart = useCartStore();
const items = computed(() => cart.enrichedItems);
const openingCheckout = ref(false);
let pageVersion = 0;
let visible = true;
onShow(() => { visible = true; pageVersion++; cart.init(); openingCheckout.value = false; });
onHide(() => { visible = false; pageVersion++; });
onUnload(() => { visible = false; pageVersion++; });

function setAll(v: boolean) {
  cart.setAllSelected(v);
}

function remove(key: string) {
  const scope = cart.scope;
  const version = pageVersion;
  uni.showModal({
    title: '从购物车移除？',
    success: r => r.confirm && visible && version === pageVersion && scope === cart.scope && cart.remove(key)
  });
}

async function restoreLegacy() {
  const scope = cart.scope;
  const version = pageVersion;
  try {
    const result = await uni.showModal({
      title: '恢复旧版购物车？',
      content: `旧版数据未记录账号归属。确认这些商品属于当前账号后再恢复：\n${cart.legacyItems.map(item => `${item.snapshot?.title || '商品'} ×${item.qty}`).join('\n')}\n同款保留当前购物车数量，新增商品默认不勾选。`,
      confirmText: '恢复到当前账号'
    });
    if (!result.confirm || !visible || version !== pageVersion) return;
    cart.restoreLegacy(scope);
  }
  catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '恢复失败，原数据已保留', icon: 'none' }); }
}

async function goCheckout() {
  if (openingCheckout.value || !visible) return;
  if (cart.selectedQty === 0) {
    uni.showToast({ title: '请先勾选商品', icon: 'none' });
    return;
  }
  const selected = items.value.filter(item => item.selected);
  if (selected.some(item => !item.available || !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > (item.product?.stock ?? 0))) {
    uni.showToast({ title: '已选商品含失效或库存不足项，请调整后结算', icon: 'none' });
    return;
  }
  if (selected.some(item => item.source !== 'real')) {
    uni.showToast({ title: '请仅选择真实商品后结算', icon: 'none' });
    return;
  }
  openingCheckout.value = true;
  const version = pageVersion;
  const scope = cart.scope;
  try {
    const guestTransferId = cart.createGuestTransfer();
    const url = `/pages/checkout/index${guestTransferId ? `?guestTransferId=${encodeURIComponent(guestTransferId)}` : ''}`;
    if (await requireLogin(url) && visible && version === pageVersion && scope === cart.scope) await uni.navigateTo({ url });
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '无法进入结算，请重试', icon: 'none' });
  } finally {
    if (version === pageVersion) openingCheckout.value = false;
  }
}
</script>

<template>
  <view class="cart-page yb-page yb-page--full-bleed h5-tab-page" :class="{ 'has-items': items.length > 0 }">
    <wd-button v-if="cart.legacyAvailable" block plain @click="restoreLegacy">发现旧版购物车，确认归属后恢复</wd-button>
    <template v-if="items.length">
      <view class="list">
        <view v-for="item in items" :key="item.key" class="row" :class="{ invalid: !item.available }">
          <view class="check yb-pressable" @click="cart.setSelected(item.key, !item.selected)">
            <view class="dot" :class="{ on: item.selected }">
              <wd-icon v-if="item.selected" name="check" size="18px" color="#fff" />
            </view>
          </view>
          <image
            v-if="item.product"
            :src="item.product.cover || UI_ASSETS.placeholders.product"
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
                <view class="qty" @click.stop>
                <view class="qty-btn yb-pressable" @click="cart.update(item.key, item.qty - 1)">
                  <text class="qty-symbol">−</text>
                </view>
                <text class="qty-val">{{ item.qty }}</text>
                <view class="qty-btn yb-pressable" @click="cart.update(item.key, item.qty + 1)">
                  <text class="qty-symbol">+</text>
                </view>
              </view>
            </view>
          </view>
          <view class="del yb-pressable" @click="remove(item.key)"><wd-icon name="delete" size="20px" color="#FFFFFF" /></view>
        </view>
      </view>

      <view class="bottom-bar">
        <view class="all-check yb-pressable" @click="setAll(!cart.allSelected)">
          <view class="dot" :class="{ on: cart.allSelected }"><wd-icon v-if="cart.allSelected" name="check" size="18px" color="#fff" /></view>
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
.cart-page { padding: 0; }
.cart-page.has-items {
  /* 仅预留结算栏本身的高度，tabBar 已由窗口层扣除。 */
  padding-bottom: calc(152rpx + env(safe-area-inset-bottom));
}
.list {
  padding: 16rpx 12rpx 8rpx;
}
.row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  background: var(--yb-surface);
  padding: 16rpx 0 16rpx 16rpx;
  border-radius: var(--yb-radius-lg);
  margin-bottom: 16rpx;
  overflow: hidden;
  box-shadow: var(--yb-shadow-card);
}
.row.invalid {
  opacity: 0.55;
}
.check {
  width: 44rpx;
  height: 44rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dot {
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  border: 2rpx solid var(--yb-border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.row .check .dot {
  width: 18px;
  height: 18px;
  border: 2px solid #667085;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(15, 17, 26, .08);
}
.row .check .dot.on { border-color: var(--yb-brand); background: var(--yb-brand); }
.dot.on {
  border-color: var(--yb-brand);
  background: var(--yb-brand);
}
.cover {
  width: 132rpx;
  height: 132rpx;
  border-radius: var(--yb-radius-md);
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
  font-size: var(--yb-font-md);
  color: var(--yb-text);
  line-height: 1.45;
  margin-bottom: 8rpx;
}
.seller {
  display: block;
  font-size: var(--yb-font-xs);
  color: var(--yb-text-tertiary);
  margin-bottom: 8rpx;
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
  color: var(--yb-text);
  font-weight: 700;
  font-size: var(--yb-font-lg);
  font-family: var(--yb-font-mono);
  letter-spacing: -0.5rpx;
  font-variant-numeric: tabular-nums;
}
.price-usdt {
  font-size: var(--yb-font-xs);
  color: var(--yb-text-tertiary);
  font-family: var(--yb-font-mono);
  margin-top: 4rpx;
}
.qty {
  display: flex;
  align-items: center;
  background: var(--yb-bg-muted);
  border-radius: var(--yb-radius-sm);
}
.qty-btn {
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--yb-text-secondary);
}
.qty-symbol {
  font-size: 32rpx;
  font-weight: 500;
  line-height: 1;
}
.qty-val {
  width: 48rpx;
  text-align: center;
  font-size: var(--yb-font-sm);
}
.del {
  display: flex;
  align-self: stretch;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  flex-shrink: 0;
  margin: -16rpx 0 -16rpx 0;
  background: var(--yb-brand);
}
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--yb-surface);
  min-height: 72rpx;
  padding: 10rpx 16rpx calc(10rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 16rpx;
  border-top: 1rpx solid var(--yb-border);
  box-shadow: 0 -8rpx 24rpx rgba(24, 29, 42, 0.04);
}
/* #ifdef H5 */
.bottom-bar { bottom: 50px; }
/* #endif */
.all-check {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 10rpx;
}
.all-check .dot {
  width: 36rpx;
  height: 36rpx;
  border: 3rpx solid #8f99a8;
  border-radius: 8rpx;
  background: var(--yb-surface);
}
.all-check .dot.on { border-color: var(--yb-brand); background: var(--yb-brand); }
.all-check .label {
  font-size: var(--yb-font-sm);
}
.amount-block {
  flex: 1;
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.amount-label {
  font-size: var(--yb-font-xs);
  color: var(--yb-text-tertiary);
}
.amount-cny {
  color: var(--yb-text);
  font-weight: 700;
  font-size: var(--yb-font-xl);
  font-family: var(--yb-font-mono);
  letter-spacing: -0.5rpx;
  font-variant-numeric: tabular-nums;
}
.amount-usdt {
  font-size: var(--yb-font-xs);
  color: var(--yb-text-tertiary);
  font-family: var(--yb-font-mono);
}
.bottom-bar :deep(.wd-button) { min-width: 132rpx; height: 72rpx; padding: 0 24rpx; }
.meta {
  display: block;
  font-size: 20rpx;
  color: #86909c;
  margin-top: 4rpx;
}
</style>
