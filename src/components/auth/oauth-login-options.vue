<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { fetchOAuthConfig, type OAuthLoginParams } from '@/service/api/auth';

const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ login: [payload: OAuthLoginParams] }>();
const available = ref(false);
const loginError = ref('');
const instance = Math.random().toString(36).slice(2);
const googleId = `google-login-${instance}`;
const telegramId = `telegram-login-${instance}`;
const telegramCallback = `telegramLogin_${instance}`;

// #ifdef H5
type GoogleApi = { accounts: { id: { initialize(options: { client_id: string; callback: (result: { credential?: string }) => void }): void; renderButton(element: HTMLElement, options: Record<string, unknown>): void } } };
type OAuthWindow = Window & typeof globalThis & { google?: GoogleApi; [key: string]: unknown };

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === 'true') return resolve();
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error('第三方登录组件加载失败'));
    if (!existing) document.head.appendChild(script);
  });
}

async function renderGoogle(clientId: string) {
  await loadScript('https://accounts.google.com/gsi/client?hl=zh_CN');
  const target = document.getElementById(googleId);
  const api = (window as OAuthWindow).google;
  if (!target || !api || props.disabled) return;
  api.accounts.id.initialize({
    client_id: clientId,
    callback: result => { if (result.credential) emit('login', { provider: 'GOOGLE', credential: result.credential }); }
  });
  target.replaceChildren();
  api.accounts.id.renderButton(target, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: Math.min(target.clientWidth || 300, 360) });
}

function renderTelegram(username: string) {
  const target = document.getElementById(telegramId);
  if (!target || props.disabled) return;
  const oauthWindow = window as OAuthWindow;
  oauthWindow[telegramCallback] = (payload: Record<string, unknown>) => {
    const telegramPayload = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, String(value)]));
    emit('login', { provider: 'TELEGRAM', telegramPayload });
  };
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.onerror = () => { loginError.value = 'Telegram 登录暂不可用，请使用邮箱登录。'; };
  script.dataset.telegramLogin = username.replace(/^@/, '');
  script.dataset.size = 'large';
  script.dataset.radius = '6';
  script.dataset.userpic = 'false';
  script.dataset.onauth = `${telegramCallback}(user)`;
  script.dataset.requestAccess = 'write';
  target.replaceChildren(script);
}
// #endif

onMounted(async () => {
  // #ifdef H5
  try {
    const config = await fetchOAuthConfig();
    const hasGoogle = config.googleEnabled && !!config.googleClientId;
    const hasTelegram = config.telegramEnabled && !!config.telegramBotUsername;
    available.value = hasGoogle || hasTelegram;
    if (!available.value) return;
    await nextTick();
    const jobs: Promise<void>[] = [];
    if (hasGoogle) jobs.push(renderGoogle(config.googleClientId!));
    if (hasTelegram) renderTelegram(config.telegramBotUsername!);
    const results = await Promise.allSettled(jobs);
    if (results.some(result => result.status === 'rejected')) loginError.value = '部分第三方登录服务暂不可用，请使用邮箱登录。';
  } catch {
    available.value = false;
  }
  // #endif
});

onBeforeUnmount(() => {
  // #ifdef H5
  delete (window as OAuthWindow)[telegramCallback];
  // #endif
});
</script>

<template>
  <!-- #ifdef H5 -->
  <view v-if="available" class="oauth-options">
    <view class="divider"><text>其他登录方式</text></view>
    <view :id="googleId" class="oauth-control" />
    <view :id="telegramId" class="oauth-control" />
    <text class="oauth-note">{{ loginError || '第三方登录由 Google / Telegram 提供。遇到组件错误或无法连接时，可使用上方邮箱登录。' }}</text>
  </view>
  <!-- #endif -->
</template>

<style scoped>
.divider{display:flex;align-items:center;gap:20rpx;color:#86909c;font-size:22rpx;margin:28rpx 0 20rpx}.divider::before,.divider::after{content:'';height:1rpx;background:#e5e6eb;flex:1}.oauth-control{display:flex;justify-content:center;min-height:0;margin-top:16rpx;overflow:hidden}.oauth-control:empty{display:none}
.oauth-note{display:block;margin-top:16rpx;color:var(--yb-muted);font-size:24rpx;line-height:1.5}
.divider { color: var(--yb-muted); font-size: 24rpx; }
.oauth-options,.oauth-control { width:100%; min-width:0; box-sizing:border-box; }
</style>
