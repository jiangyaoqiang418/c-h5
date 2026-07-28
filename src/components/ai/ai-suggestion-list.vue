<script setup lang="ts">
import type { AiSearchResult } from '@shared/api/ai';
import { go } from '@/utils/navigate';
import ProductCard from '@/components/product/product-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

interface Props {
  result?: AiSearchResult;
  loading?: boolean;
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
      <text class="loading-emoji">🤖</text>
      <text class="loading-text">AI 思考中…</text>
    </view>

    <template v-else-if="result">
      <view v-if="result.inducePurchase" class="induce" @click="inducePurchase">
        <text class="induce-emoji">💡</text>
        <view class="induce-text">
          <text class="t">{{ result.inducePurchaseHint }}</text>
          <text class="s">让全球买手为您代购 · USDT 担保 24h 接单</text>
        </view>
        <text class="arrow">›</text>
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
.loading {
  text-align: center;
  padding: 96rpx 0;
}
.loading-emoji {
  font-size: 96rpx;
  display: block;
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
.induce-emoji {
  font-size: 48rpx;
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
.arrow {
  font-size: 40rpx;
  color: #c9cdd4;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx;
}
</style>
