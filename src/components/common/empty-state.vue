<script setup lang="ts">
interface Props {
  title: string;
  description?: string;
  actionText?: string;
  emoji?: string;
}
withDefaults(defineProps<Props>(), { emoji: '📦' });
defineEmits<{ (e: 'action'): void }>();
</script>

<template>
  <view class="empty-state">
    <view class="icon-wrap">
      <text class="emoji">{{ emoji }}</text>
    </view>
    <text class="title">{{ title }}</text>
    <text v-if="description" class="desc">{{ description }}</text>
    <view v-if="actionText" class="action" @click="$emit('action')">
      <text>{{ actionText }}</text>
      <text class="arrow">→</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;
}
.icon-wrap {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: #F6EFE4;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.emoji {
  font-size: 80rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 700;
  color: #0F111A;
  margin-bottom: 12rpx;
  letter-spacing: -0.5rpx;
}
.desc {
  font-size: 26rpx;
  color: #6B7385;
  text-align: center;
  line-height: 1.6;
  max-width: 500rpx;
}
.action {
  margin-top: 32rpx;
  padding: 18rpx 40rpx;
  background: #0F111A;
  color: #FFFFFF;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  transition: transform 0.15s;
}
.action:active {
  transform: scale(0.97);
}
.arrow {
  font-size: 28rpx;
}
</style>
