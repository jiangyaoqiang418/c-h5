<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const env = ((import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env || {});
const form = reactive({
  // 仅本机 .env.development.local 提供测试账号；生产环境不加载该文件。
  email: String(env.VITE_DEV_LOGIN_EMAIL || ''),
  password: String(env.VITE_DEV_LOGIN_PASSWORD || '')
});
const submitting = ref(false);
const redirect = ref('/pages/my/index');

onLoad(query => {
  if (query?.redirect) redirect.value = decodeURIComponent(query.redirect as string);
});

async function submit() {
  if (!form.email || !form.password) {
    uni.showToast({ title: '请填写邮箱密码', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    await userStore.login(form);
    uni.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => go(redirect.value, true), 500);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

</script>

<template>
  <view class="login-page" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.login})` }">
    <view class="hero">
      <image class="logo-mark" :src="UI_ASSETS.icons.brand" mode="aspectFit" />
      <text class="title">油宝</text>
      <text class="sub">Web3 稳定币代购撮合商城</text>
    </view>

    <view class="form-card">
      <wd-input class="login-input" v-model="form.email" label="邮箱" label-width="36px" placeholder="如 wangxiaomei@bw-shop.com" />
      <wd-input class="login-input" v-model="form.password" label="密码" label-width="36px" type="password" placeholder="请输入登录密码" />
      <wd-button type="primary" block :loading="submitting" @click="submit">登 录</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  background-color: #0e1530;
  background-size: cover;
  background-position: center;
  padding: calc(32rpx + env(safe-area-inset-top)) 32rpx calc(32rpx + env(safe-area-inset-bottom));
}
.hero {
  text-align: center;
  padding: 48rpx 0;
  color: #fff;
}
.logo-mark {
  width: 112rpx;
  height: 96rpx;
  border-radius: 16rpx;
  margin-bottom: 16rpx;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
}
.sub {
  display: block;
  font-size: 24rpx;
  opacity: 0.85;
  margin-top: 8rpx;
}
.form-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
}
.login-input {
  --wot-cell-padding: 12px;
}
.divider {
  text-align: center;
  color: #86909c;
  font-size: 22rpx;
  margin: 24rpx 0 16rpx;
}
.quick-list {
  background: #fff;
  border-radius: 16rpx;
}
.quick-row {
  display: flex;
  align-items: center;
  padding: 24rpx;
  border-bottom: 1rpx solid #f7f8fa;
}
.quick-row:last-child {
  border-bottom: none;
}
.quick-info {
  flex: 1;
}
.quick-label {
  display: block;
  font-size: 26rpx;
  font-weight: 500;
  color: #1d2129;
}
.quick-desc {
  display: block;
  font-size: 22rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.quick-arrow {
  font-size: 32rpx;
  color: #c9cdd4;
}
.hint {
  display: block;
  text-align: center;
  font-size: 22rpx;
  color: #86909c;
  margin-top: 24rpx;
}
</style>
