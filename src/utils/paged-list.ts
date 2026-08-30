import { computed, ref, shallowRef } from 'vue';
import { onUnload } from '@dcloudio/uni-app';
import { getAccessToken, onSessionChanged } from '@/service/request/token';

/** 页码只在成功后推进；筛选切换、账号切换、离页后的旧响应不得覆盖当前列表。 */
export function usePagedList<T>(options: {
  fetch: (pageNo: number, pageSize: number) => Promise<{ records: T[]; total: number }>;
  key: (item: T) => string | number;
  pageSize?: number;
  preserveOnReset?: boolean;
}) {
  const list = shallowRef<T[]>([]);
  const loading = ref(false);
  const loadFailed = ref(false);
  const pageNo = ref(0);
  const total = ref(0);
  const pageSize = options.pageSize || 30;
  let sequence = 0;
  let disposed = false;
  const hasMore = computed(() => pageNo.value === 0 || pageNo.value * pageSize < total.value);

  function invalidate() {
    sequence++;
    loading.value = false;
  }
  function clear() {
    invalidate();
    list.value = [];
    pageNo.value = 0;
    total.value = 0;
    loading.value = false;
    loadFailed.value = false;
  }
  const unsubscribe = onSessionChanged(clear);
  onUnload(() => { disposed = true; sequence++; unsubscribe(); });

  async function load(reset = true) {
    if (disposed || (!reset && (loading.value || !hasMore.value))) return false;
    if (reset && !options.preserveOnReset) clear();
    const requestSequence = ++sequence;
    const token = getAccessToken();
    const target = reset ? 1 : pageNo.value + 1;
    loading.value = true;
    loadFailed.value = false;
    try {
      const page = await options.fetch(target, pageSize);
      if (sequence !== requestSequence || token !== getAccessToken()) return false;
      if (!Array.isArray(page.records) || !['number', 'string'].includes(typeof page.total) || String(page.total).trim() === ''
        || !Number.isSafeInteger(Number(page.total)) || Number(page.total) < 0) throw new Error('分页响应缺少有效记录或总数，请重试');
      if (!page.records.length && (target - 1) * pageSize < Number(page.total)) throw new Error('分页数据不完整，请刷新重试');
      const existing = new Map((reset ? [] : list.value).map(item => [String(options.key(item)), item]));
      page.records.forEach(item => existing.set(String(options.key(item)), item));
      list.value = [...existing.values()];
      total.value = Number(page.total);
      pageNo.value = target;
      return true;
    } catch (error) {
      if (sequence !== requestSequence || token !== getAccessToken()) return false;
      loadFailed.value = true;
      uni.showToast({ title: error instanceof Error ? error.message : '列表加载失败', icon: 'none' });
      return false;
    } finally {
      if (sequence === requestSequence) {
        loading.value = false;
        uni.stopPullDownRefresh();
      }
    }
  }
  return { list, loading, loadFailed, hasMore, load, pageNo, total, invalidate, clear };
}
