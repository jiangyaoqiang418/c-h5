import { computed, ref } from 'vue';
import { onHide, onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { useUserStore } from '@/stores';
import { getAccessToken } from '@/service/request/token';
import { useNavigationGuards } from './navigate';
import { usePageOperation } from './page-operation';
import { usePagedList } from './paged-list';

/** 私有记录页共用会话、初始化与原页重试；不把资料读取失败当成空记录。 */
export function usePrivatePagedList<T>(options: {
  url: string;
  fetch: (pageNo: number, pageSize: number) => Promise<{ records: T[]; total: number }>;
  key: (item: T) => string | number;
  resetView?: () => void;
}) {
  const userStore = useUserStore();
  const { requireLogin } = useNavigationGuards();
  const reading = ref(false);
  const initFailed = ref(false);
  let version = 0;
  let retryReset = true;
  const page = usePageOperation(() => {
    version++;
    reading.value = false;
    initFailed.value = false;
    retryReset = true;
    options.resetView?.();
  });
  const pager = usePagedList<T>({ fetch: options.fetch, key: options.key, pageSize: 50, preserveOnReset: true });
  const loading = computed(() => reading.value || pager.loading.value);
  const loadFailed = computed(() => initFailed.value || pager.loadFailed.value);

  async function load(reset = true) {
    if (!page.visible.value || reading.value) return;
    const operation = page.capture();
    const requestVersion = ++version;
    const current = () => operation.isCurrent() && requestVersion === version;
    reading.value = true;
    initFailed.value = false;
    retryReset = reset;
    try {
      await userStore.init();
      if (!current()) return;
      if (!userStore.currentUser) {
        if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
        pager.clear();
        options.resetView?.();
        return;
      }
      await pager.load(reset);
    } catch (error) {
      if (!current()) return;
      initFailed.value = true;
      uni.showToast({ title: error instanceof Error ? error.message : '记录读取失败，请重试', icon: 'none' });
    } finally {
      if (current()) { reading.value = false; uni.stopPullDownRefresh(); }
    }
  }
  function retry() { return load(retryReset); }
  async function login() {
    const operation = page.capture();
    if (await requireLogin(options.url) && operation.isCurrent()) await load();
  }
  function canOpen(item: T) {
    return page.visible.value && !!userStore.currentUser && pager.list.value.includes(item);
  }
  onShow(() => load());
  onPullDownRefresh(() => load());
  onReachBottom(() => loadFailed.value ? retry() : load(false));
  onHide(() => {
    version++;
    reading.value = false;
    pager.invalidate();
    options.resetView?.();
  });
  return { list: pager.list, hasMore: pager.hasMore, loading, loadFailed, load, retry, login, canOpen };
}
