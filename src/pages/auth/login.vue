<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { MOCK_USERS, authApi } from '@shared';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const form = reactive({ email: '', password: '' });
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
    const result = await authApi.mockLogin(form);
    if ('error' in result) {
      uni.showToast({ title: result.error, icon: 'none' });
      return;
    }
    await userStore.login(result.user.id);
    uni.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => go(redirect.value, true), 500);
  } finally {
    submitting.value = false;
  }
}

async function oneClick(userId: number) {
  submitting.value = true;
  try {
    await userStore.login(userId);
    uni.showToast({ title: '已登录', icon: 'success' });
    setTimeout(() => go(redirect.value, true), 500);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="login-page">
    <view class="hero">
      <view class="logo-mark">油宝</view>
      <text class="title">油宝</text>
      <text class="sub">Web3 稳定币代购撮合商城</text>
    </view>

    <view class="form-card">
      <wd-input v-model="form.email" label="邮箱" placeholder="如 wangxiaomei@bw-shop.com" />
      <wd-input v-model="form.password" label="密码" type="password" placeholder="原型阶段，任意密码即可" />
      <wd-button type="primary" block :loading="submitting" @click="submit">登 录</wd-button>
    </view>

    <view class="divider">
      <text>演示账号一键登录</text>
    </view>

    <view class="quick-list">
      <view
        v-for="u in MOCK_USERS"
        :key="u.userId"
        class="quick-row"
        @click="oneClick(u.userId)"
      >
        <view class="quick-info">
          <text class="quick-label">{{ u.label }}</text>
          <text class="quick-desc">{{ u.desc }}</text>
        </view>
        <text class="quick-arrow">›</text>
      </view>
    </view>

    <text class="hint">原型阶段不支持新建用户，使用演示账号即可</text>
  </view>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #4d80f0 0%, #722ed1 50%, #fff 50%);
  padding: 32rpx;
}
.hero {
  text-align: center;
  padding: 48rpx 0;
  color: #fff;
}
.logo-mark {
  min-width: 96rpx;
  height: 96rpx;
  padding: 0 24rpx;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 16rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
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
