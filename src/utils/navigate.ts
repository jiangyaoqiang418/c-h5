/**
 * 统一跳转 + 登录守卫 + 买手守卫。
 *
 * 用法：
 *   import { go, requireLogin, requireBuyer } from '@/utils/navigate';
 *   go('/pages/wallet/index');
 *   if (await requireLogin('/pages/cart/index')) { ... }
 */

import { useUserStore } from '@/stores';

const TAB_PATHS = new Set([
  '/pages/index/index',
  '/pages/category/index',
  '/pages/purchase/hall',
  '/pages/cart/index',
  '/pages/my/index'
]);

export function go(url: string, redirect = false): void {
  const path = url.split('?')[0];
  if (TAB_PATHS.has(path)) {
    uni.switchTab({ url: path });
  } else if (redirect) {
    uni.redirectTo({ url });
  } else {
    uni.navigateTo({ url });
  }
}

export function goBack(delta = 1): void {
  uni.navigateBack({ delta });
}

export function reLaunch(url: string): void {
  uni.reLaunch({ url });
}

export async function requireLogin(redirectUrl?: string): Promise<boolean> {
  const userStore = useUserStore();
  await userStore.init();
  if (!userStore.isLoggedIn) {
    uni.showModal({
      title: '请先登录',
      content: '登录后即可使用此功能',
      confirmText: '去登录',
      cancelText: '取消',
      success: r => {
        if (r.confirm) {
          const back = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : '';
          go(`/pages/auth/login${back}`);
        }
      }
    });
    return false;
  }
  return true;
}

export async function requireBuyer(): Promise<boolean> {
  const userStore = useUserStore();
  await userStore.init();
  const u = userStore.currentUser;
  if (!u?.isBuyer) {
    uni.showToast({
      title: '此账号非买手，请在「我的-切换演示账号」里选张丽琳或杨建军',
      icon: 'none',
      duration: 3000
    });
    return false;
  }
  if (u.kycStatus !== 'approved') {
    uni.showToast({ title: '请先完成 KYC 认证', icon: 'none' });
    setTimeout(() => go('/pages/kyc/index'), 1200);
    return false;
  }
  if (!userStore.isBuyerActive) userStore.setAudience('buyer');
  return true;
}
