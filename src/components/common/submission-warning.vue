<script setup lang="ts">
defineProps<{ pending: boolean; running: boolean }>();
defineEmits<{ review: []; acknowledge: [] }>();
</script>

<template>
  <view v-if="pending && !running" class="submission-warning">
    <text>上次提交结果待核对，请勿重复操作。网络超时不代表后台未受理。</text>
    <view class="actions">
      <wd-button plain size="small" @click="$emit('review')">查看记录</wd-button>
      <wd-button plain size="small" @click="$emit('acknowledge')">已核对记录</wd-button>
    </view>
  </view>
</template>

<style scoped>
.submission-warning { padding:24rpx; margin-bottom:20rpx; background:#fff4e5; color:#8a5200; border-radius:16rpx; font-size:24rpx; line-height:1.6; }
.actions { display:flex; gap:16rpx; margin-top:16rpx; }
</style>
