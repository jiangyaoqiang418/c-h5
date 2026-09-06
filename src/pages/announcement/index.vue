<script setup lang="ts">
import EmptyState from '@/components/common/empty-state.vue';
import { go } from '@/utils/navigate';

function returnFromPage() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  go('/pages/index/index', true);
}
</script>

<template>
  <view class="yb-page">
    <EmptyState title="暂不可用" action-text="返回" @action="returnFromPage" />
  </view>
</template>
