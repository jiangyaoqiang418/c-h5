<script setup lang="ts">
import { ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { buyerApi } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const activeKey = ref<Api.Product.ProductStatus | 'all'>('all');
const list = ref<Api.Product.ProductRecord[]>([]);

const TABS: { key: Api.Product.ProductStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'NORMAL', label: '正常' },
  { key: 'PENDING_AUDIT', label: '待审核' },
  { key: 'FROZEN', label: '已冻结' }
];

async function load() {
  if (!userStore.currentUser) return;
  const status = activeKey.value === 'all' ? undefined : activeKey.value;
  const r = await buyerApi.fetchMyProducts(userStore.currentUser.id, status);
  list.value = r.records;
}
onShow(load);
watch(activeKey, load);
</script>

<template>
  <view class="bp-page">
    <wd-tabs v-model="activeKey" sticky>
      <wd-tab v-for="t in TABS" :key="t.key" :name="t.key" :title="t.label" />
    </wd-tabs>
    <view class="list">
      <view v-if="list.length">
        <view v-for="p in list" :key="p.id" class="card" @click="go(`/pages/product/detail?id=${p.id}`)">
          <image :src="p.images[0]?.url" mode="aspectFill" class="cover" />
          <view class="info">
            <text class="title">{{ p.title }}</text>
            <text class="cat">{{ p.categoryPath }}</text>
            <view class="meta">
              <text class="price">U {{ formatAmount(p.price) }}</text>
              <text class="stock">库存 {{ p.stock }}</text>
            </view>
            <view class="tags">
              <wd-tag size="small" :type="p.status === 'NORMAL' ? 'success' : 'default'">{{ p.status }}</wd-tag>
            </view>
          </view>
        </view>
      </view>
      <EmptyState v-else title="暂无商品" />
    </view>

    <view class="fab" @click="go('/pages/buyer/product-create')">+ 上架</view>
  </view>
</template>

<style lang="scss" scoped>
.bp-page { min-height: 100vh; background: #f7f8fa; padding-bottom: 200rpx; }
.list { padding: 16rpx; }
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 12rpx;
  display: flex;
  gap: 16rpx;
}
.cover { width: 160rpx; height: 160rpx; border-radius: 12rpx; background: #f7f8fa; flex-shrink: 0; }
.info { flex: 1; display: flex; flex-direction: column; }
.title { font-size: 26rpx; font-weight: 600; line-height: 1.3; }
.cat { font-size: 22rpx; color: #86909c; margin-top: 4rpx; }
.meta { display: flex; justify-content: space-between; margin-top: 8rpx; align-items: center; }
.price { font-size: 30rpx; color: #f53f3f; font-weight: 700; font-family: ui-monospace, monospace; }
.stock { font-size: 22rpx; color: #4e5969; }
.tags { margin-top: 8rpx; }
.fab {
  position: fixed; right: 32rpx; bottom: calc(48rpx + env(safe-area-inset-bottom));
  background: #4d80f0; color: #fff;
  padding: 20rpx 32rpx; border-radius: 48rpx;
  font-size: 26rpx;
  box-shadow: 0 8rpx 24rpx rgba(77,128,240,0.4);
}
</style>
