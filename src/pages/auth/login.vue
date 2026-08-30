<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onHide, onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { getAccessToken, onSessionChanged } from '@/service/request/token';
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
const loginConfirmed = ref(false);
let confirmedToken = '';
let visible = true;
let disposed = false;
let pageVersion = 0;
const unsubscribe = onSessionChanged(() => { loginConfirmed.value = false; confirmedToken = ''; form.password = ''; });
onShow(() => { visible = true; });
onHide(() => { visible = false; pageVersion++; form.password = ''; });
onUnload(() => { disposed = true; visible = false; pageVersion++; form.password = ''; unsubscribe(); });

function continueLogin() {
  if (visible && !disposed && loginConfirmed.value && confirmedToken === getAccessToken() && userStore.currentUser) go(redirect.value, true);
}

onLoad(query => {
  if (query?.redirect) {
    try {
      const raw = String(query.redirect);
      // H5/App 路由可能已解码外层参数；不要再次解码目标 URL 内的查询值。
      const target = raw.startsWith('/pages/') ? raw : decodeURIComponent(raw);
      if (/^\/pages\/[a-z0-9/-]+(?:\?|$)/i.test(target) && !target.startsWith('/pages/auth/')) redirect.value = target;
    } catch { /* 非法回跳参数使用默认个人中心。 */ }
  }
});

async function submit() {
  if (!visible || disposed || submitting.value) return;
  if (loginConfirmed.value) return continueLogin();
  if (!form.email || !form.password) {
    uni.showToast({ title: '请填写邮箱密码', icon: 'none' });
    return;
  }
  submitting.value = true;
  const version = pageVersion;
  const origin = getCurrentPages().slice(-1)[0];
  const current = () => visible && !disposed && version === pageVersion && origin === getCurrentPages().slice(-1)[0];
  const request = { email: form.email, password: form.password };
  try {
    const receipt = await userStore.login(request, current);
    if (disposed || receipt.token !== getAccessToken() || receipt.userId !== userStore.realUserId) return;
    confirmedToken = receipt.token;
    loginConfirmed.value = true;
    form.password = '';
    if (current()) {
      uni.showToast({ title: '登录成功', icon: 'success' });
      continueLogin();
    }
  } catch (error) {
    if (current()) uni.showToast({ title: loginConfirmed.value ? '已登录，请点击继续进入' : error instanceof Error ? error.message : '登录失败', icon: 'none' });
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
      <wd-button type="primary" block :loading="submitting" @click="submit">{{ loginConfirmed ? '已登录，继续进入' : '登 录' }}</wd-button>
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
