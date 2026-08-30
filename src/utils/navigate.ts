/**
 * 统一跳转 + 登录守卫 + 买手守卫。
 *
 * 用法：
 *   import { go, useNavigationGuards } from '@/utils/navigate';
 *   const { requireLogin, requireBuyer } = useNavigationGuards(); // 页面 setup 内调用
 *   go('/pages/wallet/index');
 *   if (await requireLogin('/pages/cart/index')) { ... }
 */

import { useUserStore } from '@/stores';
import { getAccessToken } from '@/service/request/token';
import { usePageOperation } from './page-operation';

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

/** 在 setup 中注册生命周期；守卫可在点击、onLoad/onShow 或异步初始化后调用。 */
export function useNavigationGuards() {
  const userStore = useUserStore();
  type Operation = ReturnType<ReturnType<typeof usePageOperation>['capture']>;
  let loginPrompt: Operation | undefined;
  let buyerCheck: Operation | undefined;
  const page = usePageOperation(() => { loginPrompt = undefined; buyerCheck = undefined; });

  async function requireLogin(redirectUrl?: string): Promise<boolean> {
    if (!page.visible.value) return false;
    const operation = page.capture();
    if (!operation.isCurrent()) return false;
    try { await userStore.init(); }
    catch {
      if (operation.isCurrent()) uni.showToast({ title: '账户资料暂未加载成功，请联网后重试', icon: 'none' });
      return false;
    }
    if (!operation.isCurrent()) return false;
    if (userStore.isLoggedIn) return true;
    if (getAccessToken()) {
      uni.showToast({ title: '账户资料暂未加载成功，请联网后重试', icon: 'none' });
      return false;
    }
    if (loginPrompt?.isCurrent()) return false;
    loginPrompt = operation;
    // 与原调用约定一致：未登录立即返回 false，确认弹窗不延续原业务动作。
    void (async () => {
      try {
        const result = await uni.showModal({
          title: '请先登录', content: '登录后即可使用此功能', confirmText: '去登录', cancelText: '取消'
        });
        if (!result.confirm || !operation.isCurrent() || userStore.isLoggedIn || getAccessToken()) return;
        const back = redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : '';
        go(`/pages/auth/login${back}`);
      } catch {
        if (operation.isCurrent()) uni.showToast({ title: '登录提示未能打开，请重试', icon: 'none' });
      } finally {
        if (loginPrompt === operation) loginPrompt = undefined;
      }
    })();
    return false;
  }

  async function requireBuyer(): Promise<boolean> {
    if (!page.visible.value || buyerCheck?.isCurrent()) return false;
    const operation = page.capture();
    if (!operation.isCurrent()) return false;
    buyerCheck = operation;
    let waitingForKyc = false;
    try {
      if (!await requireLogin() || !operation.isCurrent()) return false;
      await userStore.refreshProfile();
      if (!operation.isCurrent()) return false;
      const user = userStore.currentUser;
      if (!user?.isBuyer) {
        uni.showToast({ title: '此账号尚未成为买手，请在「我的」提交买手申请', icon: 'none', duration: 3000 });
        return false;
      }
      if (user.kycStatus !== 'approved') {
        uni.showToast({ title: '请先完成 KYC 认证', icon: 'none' });
        waitingForKyc = true;
        operation.schedule(() => {
          if (buyerCheck === operation) buyerCheck = undefined;
          if (userStore.currentUser?.isBuyer && userStore.currentUser.kycStatus !== 'approved') go('/pages/kyc/index');
        }, 1200);
        return false;
      }
      if (!userStore.isBuyerActive && !userStore.setAudience('buyer')) return false;
      return true;
    } catch {
      if (operation.isCurrent()) uni.showToast({ title: '身份状态读取失败，请稍后重试', icon: 'none' });
      return false;
    } finally {
      if (!waitingForKyc && buyerCheck === operation) buyerCheck = undefined;
    }
  }

  return { requireLogin, requireBuyer };
}
