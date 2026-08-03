<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { useCartStore, useUserStore } from '@/stores';

onLaunch(async () => {
  const userStore = useUserStore();
  const cartStore = useCartStore();
  await userStore.init();
  cartStore.init();
});
</script>

<style lang="scss">
/* 全局样式 */
page {
  background-color: #f7f8fa;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  color: #1d2129;
}

/* #ifdef H5 */
/*
 * 顶部导航和 tabBar 都是 UniApp 的窗口层，不属于任何页面内容。
 * H5 通过框架变量获取它们实际占用的高度，页面只使用两者之间的空间。
 */
uni-page-head ~ uni-page-wrapper > uni-page-body > * {
  min-height: calc(100vh - var(--window-top)) !important;
  box-sizing: border-box;
}
uni-page-head ~ uni-page-wrapper > uni-page-body > .chat-page,
uni-page-head ~ uni-page-wrapper > uni-page-body > .im-page {
  height: calc(100vh - var(--window-top)) !important;
}

/* 一级 tab 页在窗口导航与原生 tabBar 之间滚动。 */
.h5-tab-page {
  height: calc(100vh - var(--window-bottom)) !important;
  min-height: 0 !important;
  overflow-y: auto;
  box-sizing: border-box;
  padding-bottom: 0 !important;
}
uni-page-head ~ uni-page-wrapper > uni-page-body > .h5-tab-page {
  height: calc(100vh - var(--window-top) - var(--window-bottom)) !important;
}

/* H5 隐藏滚动条美化 */
::-webkit-scrollbar {
  display: none;
}

/* #endif */
</style>
