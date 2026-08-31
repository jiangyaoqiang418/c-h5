<script setup lang="ts">
import type { AiSearchResult } from '@shared/api/ai';
import { go } from '@/utils/navigate';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

interface Props {
  result?: AiSearchResult;
  loading?: boolean;
  demo?: boolean;
}
const props = defineProps<Props>();

function inducePurchase() {
  if (!props.result) return;
  go(`/pages/purchase/create?productHint=${encodeURIComponent(props.result.query)}`);
}
</script>

<template>
  <view class="ai-list">
    <view v-if="loading" class="loading">
      <wd-icon name="flash" size="48rpx" color="var(--yb-brand)" />
      <text class="loading-text">AI 思考中…</text>
    </view>

    <template v-else-if="result">
      <text v-if="demo" class="demo-notice">模拟推荐：仅供浏览，实际商品以搜索和详情页为准</text>
      <view v-if="result.inducePurchase" class="induce" @click="inducePurchase">
        <wd-icon name="bulb" size="28px" color="var(--yb-brand)" />
        <view class="induce-text">
          <text class="t">{{ result.inducePurchaseHint }}</text>
          <text class="s">让全球买手为您代购 · USDT 担保 24h 接单</text>
        </view>
        <wd-icon name="arrow-right" size="18px" color="#a6a9b1" />
      </view>

      <view v-if="result.suggestions.length" class="grid">
        <ProductCard v-for="p in result.suggestions" :key="p.id" :product="p" />
      </view>
      <EmptyState
        v-else
        title="没有找到匹配商品"
        description="试试发起求购"
        action-text="发起求购"
        @action="inducePurchase"
      />
    </template>
  </view>
</template>

<style lang="scss" scoped>
.ai-list {
  padding: 16rpx;
}
.demo-notice { display: block; margin-bottom: 16rpx; color: #86909c; font-size: 22rpx; line-height: 1.5; }
.loading {
  text-align: center;
  padding: 96rpx 0;
}
.loading-text {
  font-size: 26rpx;
  color: #86909c;
  margin-top: 16rpx;
  display: block;
}
.induce {
  display: flex;
  gap: 16rpx;
  align-items: center;
  background: linear-gradient(135deg, #fff7e6 0%, #f5e8ff 100%);
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}
.induce-text {
  flex: 1;
}
.t {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
}
.s {
  display: block;
  font-size: 22rpx;
  color: #4e5969;
  margin-top: 4rpx;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.grid > * { width: calc((100% - 16rpx) / 2); min-width: 0; }
</style>
