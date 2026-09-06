<script setup lang="ts">
import EmptyState from '@/components/common/empty-state.vue';
import { go } from '@/utils/navigate';

function returnFromPage() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  go('/pages/my/index', true);
}
</script>

<template>
  <view class="yb-page">
    <EmptyState title="会话链接已失效" description="此链接已不可用，请从消息中心或订单详情进入订单群。" action-text="返回" @action="returnFromPage" />
  </view>
</template>
