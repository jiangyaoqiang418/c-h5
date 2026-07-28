<script setup lang="ts">
interface Props {
  text: string;
  title?: string;
  size?: number;
}
const props = withDefaults(defineProps<Props>(), { size: 24, title: '说明' });

function show() {
  uni.showModal({
    title: props.title,
    content: props.text,
    showCancel: false,
    confirmText: '知道了'
  });
}
</script>

<template>
  <text class="info-icon" :style="{ fontSize: size + 'rpx' }" @click.stop="show">ⓘ</text>
</template>

<style lang="scss" scoped>
.info-icon {
  color: #A8ADB8;
  vertical-align: middle;
  margin-left: 6rpx;
  display: inline-block;
  line-height: 1;
}
</style>
