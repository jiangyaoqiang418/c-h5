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

/* H5 隐藏滚动条美化 */
::-webkit-scrollbar {
  display: none;
}

/* ============================================================
 * 强制隐藏 UniApp H5 原生 tabBar
 * 原生 uni-tabbar 用 static/tab-*.png 空占位 PNG（95B），z-index 998
 * 会盖住我们自定义的 <CustomTabBar>。用全局 CSS 强制隐藏。
 * 注：pages.json 的 tabBar.list 配置保留（uni.switchTab API 依赖）。
 * ============================================================ */
uni-tabbar,
.uni-tabbar,
.uni-tabbar-top,
.uni-tabbar-bottom {
  display: none !important;
}
.uni-tabbar ~ .uni-placeholder,
.uni-placeholder {
  display: none !important;
}
uni-app.uni-app--showtabbar,
uni-app.uni-app--showtabbar uni-page-wrapper {
  padding-bottom: 0 !important;
}
</style>
