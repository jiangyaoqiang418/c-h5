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

/*
 * 顶部导航和 tabBar 都是 UniApp 的窗口层，不属于任何页面内容。
 * 五个一级页本身作为滚动容器，始终只占两者之间的区域；这一规则同时适用于
 * 移动 H5 与 App，避免 App 端页面滚动到原生导航栏或 tabBar 下方。
 */
.h5-tab-page {
  height: calc(100vh - var(--window-top) - var(--window-bottom)) !important;
  min-height: 0 !important;
  overflow-y: auto;
  box-sizing: border-box;
  padding-bottom: 0 !important;
}

/* #ifdef H5 */
uni-page-head {
  box-shadow: 0 4rpx 12rpx rgba(15, 17, 26, 0.1);
}

uni-page-head ~ uni-page-wrapper > uni-page-body > * {
  min-height: calc(100vh - var(--window-top)) !important;
  box-sizing: border-box;
}
uni-page-head ~ uni-page-wrapper > uni-page-body > .chat-page,
uni-page-head ~ uni-page-wrapper > uni-page-body > .im-page {
  height: calc(100vh - var(--window-top)) !important;
}

/* 移动浏览器地址栏伸缩时优先使用动态视口高度，旧浏览器继续使用上方 100vh。 */
@supports (height: 100dvh) {
  uni-page-head ~ uni-page-wrapper > uni-page-body > * {
    min-height: calc(100dvh - var(--window-top)) !important;
  }
  uni-page-head ~ uni-page-wrapper > uni-page-body > .chat-page,
  uni-page-head ~ uni-page-wrapper > uni-page-body > .im-page {
    height: calc(100dvh - var(--window-top)) !important;
  }
  uni-page-head ~ uni-page-wrapper > uni-page-body > .h5-tab-page {
    height: calc(100dvh - var(--window-top) - var(--window-bottom)) !important;
  }
}

/* H5 隐藏滚动条美化 */
::-webkit-scrollbar {
  display: none;
}

/* #endif */

/* #ifdef H5 */
@supports (height: 100dvh) {
  .h5-tab-page {
    height: calc(100dvh - var(--window-top) - var(--window-bottom)) !important;
  }
}
/* #endif */
</style>
