import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { type Audience, MOCK_USERS, STORAGE_KEY, authApi } from '@shared';
import { storage } from '@/utils/storage';

export const useUserStore = defineStore('bw-user', () => {
  const currentUser = ref<Api.User.UserRecord | undefined>();
  const currentAudience = ref<Audience>('customer');
  const initialized = ref(false);

  function loadAudienceFromStorage(): Audience {
    const raw = storage.get<string>(STORAGE_KEY.currentAudience);
    return raw === 'buyer' ? 'buyer' : 'customer';
  }

  async function init() {
    if (initialized.value) return;
    const raw = storage.get<string>(STORAGE_KEY.currentUserId);
    let userId = raw ? Number(raw) : undefined;
    // 迁移：老会话可能存了 MOCK_USERS 池外的旧 id（如 12 周维一——曾被误标为张丽琳）
    // 检测到就复位到默认演示账号，防止「dropdown label 与 header 昵称对不上」的混淆
    if (userId && !MOCK_USERS.some(u => u.userId === userId)) {
      storage.set(STORAGE_KEY.currentUserId, String(MOCK_USERS[0].userId));
      storage.set(STORAGE_KEY.currentAudience, 'customer');
      userId = MOCK_USERS[0].userId;
    }
    if (userId) {
      const result = await authApi.switchCurrentUser(userId);
      if (result && !('error' in result)) {
        currentUser.value = result;
        currentAudience.value =
          result.isBuyer && result.kycStatus === 'approved' ? loadAudienceFromStorage() : 'customer';
      }
    }
    initialized.value = true;
  }

  async function login(userId: number) {
    const result = await authApi.switchCurrentUser(userId);
    if (!result || 'error' in result) throw new Error((result as { error: string })?.error || '登录失败');
    currentUser.value = result;
    currentAudience.value = 'customer';
    storage.set(STORAGE_KEY.currentUserId, String(userId));
    storage.set(STORAGE_KEY.currentAudience, 'customer');
  }

  function logout() {
    currentUser.value = undefined;
    currentAudience.value = 'customer';
    storage.remove(STORAGE_KEY.currentUserId);
    storage.remove(STORAGE_KEY.currentAudience);
  }

  function switchDemoUser(userId: number) {
    storage.set(STORAGE_KEY.currentUserId, String(userId));
    storage.set(STORAGE_KEY.currentAudience, 'customer');
    uni.reLaunch({ url: '/pages/index/index' });
  }

  function setAudience(a: Audience) {
    if (a === 'buyer' && !canSwitchToBuyer.value) return false;
    currentAudience.value = a;
    storage.set(STORAGE_KEY.currentAudience, a);
    return true;
  }

  const isLoggedIn = computed(() => !!currentUser.value);
  const displayName = computed(
    () => currentUser.value?.nickname || currentUser.value?.email?.split('@')[0] || ''
  );
  const canSwitchToBuyer = computed(
    () => !!currentUser.value?.isBuyer && currentUser.value?.kycStatus === 'approved'
  );
  const isBuyerActive = computed(() => currentAudience.value === 'buyer');
  const demoUserList = computed(() => MOCK_USERS);

  return {
    currentUser,
    currentAudience,
    isLoggedIn,
    displayName,
    canSwitchToBuyer,
    isBuyerActive,
    demoUserList,
    init,
    login,
    logout,
    switchDemoUser,
    setAudience
  };
});
