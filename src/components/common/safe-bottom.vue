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
  background: var(--yb-elevated);
  border-top: 1rpx solid var(--yb-hairline);
  box-shadow: 0 -8rpx 32rpx rgba(15, 17, 26, 0.05);
  z-index: 100;
}
.content {
  padding: 16rpx 32rpx;
}
.safe-area {
  height: env(safe-area-inset-bottom);
  background: var(--yb-elevated);
}
</style>
