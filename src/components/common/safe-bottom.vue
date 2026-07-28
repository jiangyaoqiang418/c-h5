<script setup lang="ts">
/**
 * 底部固定操作栏 wrapper — 内含 safe-area-inset-bottom 适配。
 * 用法：
 *   <SafeBottom>
 *     <wd-button type="primary" block>提交</wd-button>
 *   </SafeBottom>
 */
</script>

<template>
  <view class="safe-bottom-wrap">
    <view class="content">
      <slot />
    </view>
    <view class="safe-area" />
  </view>
</template>

<style lang="scss" scoped>
.safe-bottom-wrap {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1rpx solid #f2f3f5;
  z-index: 100;
}
.content {
  padding: 16rpx 24rpx;
}
.safe-area {
  height: env(safe-area-inset-bottom);
  background: #fff;
}
</style>
