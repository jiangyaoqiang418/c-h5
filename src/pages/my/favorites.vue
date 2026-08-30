<script setup lang="ts">
import { ref } from 'vue';
import { onHide, onShow, onUnload, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { fetchFavoriteProducts, unfavoriteProduct } from '@/service/api/product';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { getAccessToken, onSessionChanged } from '@/service/request/token';

const list = ref<Api.RealProduct.ProductDTO[]>([]);
const total = ref(0);
const current = ref(1);
const size = 20;
const loading = ref(false);
const loadFailed = ref(false);
const userStore = useUserStore();
const removing = ref(false);
let loadSequence = 0;
let visible = true;
let disposed = false;
const unsubscribeSession = onSessionChanged(() => {
  loadSequence++;
  list.value = [];
  total.value = 0;
  current.value = 1;
  loading.value = false;
  loadFailed.value = false;
  removing.value = false;
});

onShow(() => { visible = true; load(true); });
onHide(() => { visible = false; });
onUnload(() => { disposed = true; loadSequence++; unsubscribeSession(); });

async function load(reset = false) {
  if (disposed || removing.value) { uni.stopPullDownRefresh(); return; }
  if (loading.value && !reset) return;
  if (reset) {
    loadFailed.value = false;
    current.value = 1;
    list.value = [];
    total.value = 0;
  }
  const sequence = ++loadSequence;
  const requestedPage = reset ? 1 : current.value + 1;
  loading.value = true;
  try {
    await userStore.init();
    if (!userStore.currentUser) return;
    const page = await fetchFavoriteProducts({ pageNo: requestedPage, pageSize: size });
    if (sequence !== loadSequence) return;
    list.value = reset ? page.records : list.value.concat(page.records);
    total.value = page.total;
    current.value = requestedPage;
  } catch (error) {
    if (sequence === loadSequence) {
      if (!list.value.length) loadFailed.value = true;
      uni.showToast({ title: error instanceof Error ? error.message : '收藏加载失败', icon: 'none' });
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
      uni.stopPullDownRefresh();
    }
  }
}

async function removeFavorite(id: string | number) {
  const token = getAccessToken();
  if (removing.value || disposed || !visible || !token) return;
  removing.value = true;
  let removed = false;
  try {
    const result = await uni.showModal({ title: '取消收藏？', content: '取消后可在商品详情重新收藏' });
    if (!result.confirm || disposed || !visible || token !== getAccessToken()) return;
    // 删除会改变服务端 offset，丢弃删除前的追加响应，成功后从第一页重建分页。
    loadSequence++;
    loading.value = false;
    await unfavoriteProduct(id);
    if (disposed || token !== getAccessToken()) return;
    removed = true;
    list.value = list.value.filter(item => String(item.id) !== String(id));
    uni.showToast({ title: '已取消收藏', icon: 'success' });
  } catch (error) {
    if (!disposed && token === getAccessToken()) uni.showToast({ title: error instanceof Error ? error.message : '取消收藏失败', icon: 'none' });
  } finally {
    if (!disposed && token === getAccessToken()) {
      removing.value = false;
      if (removed) await load(true);
    }
  }
}

onPullDownRefresh(() => load(true));
onReachBottom(() => {
  if (!loading.value && list.value.length < total.value) {
    load();
  }
});
</script>

<template>
  <view class="favorites-page yb-page">
    <view v-if="list.length" class="grid">
      <view v-for="product in list" :key="product.id" class="favorite-item">
        <ProductCard :product="product" />
        <view class="remove" @click.stop="removeFavorite(product.id)">{{ removing ? '处理中…' : '取消收藏' }}</view>
      </view>
    </view>
    <EmptyState v-else-if="loadFailed" title="收藏加载失败" description="请稍后重试" />
    <EmptyState v-else-if="!loading" title="暂未收藏商品" description="去商品详情收藏你喜欢的商品" />
    <view v-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载收藏</text></view>
    <wd-button v-if="loadFailed" block plain :loading="loading" @click="load(true)">加载失败，点击重试</wd-button>
    <view v-if="!loading && !loadFailed && list.length && list.length >= total" class="no-more">没有更多了</view>
  </view>
</template>

<style lang="scss" scoped>
.favorites-page { min-height: 100%; padding: 24rpx; }
.grid { display: flex; flex-wrap: wrap; gap: 20rpx 16rpx; }
.favorite-item { width: calc((100% - 16rpx) / 2); min-width: 0; }
.remove { margin-top: 12rpx; padding: 14rpx 0; border-radius: var(--yb-radius-md); background: var(--yb-surface); border:1rpx solid var(--yb-border); color: var(--yb-text-secondary); font-size: 24rpx; text-align: center; }
.loading, .no-more { padding: 32rpx; color: #86909c; font-size: 24rpx; text-align: center; }.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; }
</style>
