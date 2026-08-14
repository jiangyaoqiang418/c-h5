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
 * App-Vue 的页面可视区已经由原生导航栏和 tabBar 裁剪。
 * 页面根节点再使用 100vh 会把窗口层重复算入高度，造成真机滚动到底部空白。
 * 默认页面统一以宿主页面高度为基准；自定义导航页仍由各自内容决定高度。
 */
/* #ifdef APP-PLUS */
page > * {
  min-height: 100% !important;
  box-sizing: border-box;
}

page > .chat-page,
page > .im-page,
page > .login-page {
  height: 100% !important;
}
/* #endif */

/*
 * 顶部导航和 tabBar 都由 UniApp 的 `uni-page-wrapper` 先行扣除。
 * 页面根节点必须直接占用该容器，不得再次按 100vh 计算，否则 H5 会溢出到
 * tabBar 下方，App 也会在主视图底部留下空白。
 */
.h5-tab-page {
  height: 100% !important;
  min-height: 0 !important;
  overflow-y: auto;
  box-sizing: border-box;
}

/* #ifdef H5 */
uni-page-head {
  box-shadow: 0 4rpx 12rpx rgba(15, 17, 26, 0.1);
}

uni-page-wrapper > uni-page-body {
  height: 100%;
  min-height: 0 !important;
  box-sizing: border-box;
}

/* H5 隐藏滚动条美化 */
::-webkit-scrollbar {
  display: none;
}

/* #endif */

</style>
