import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useUserStore } from '@/stores/user';
import { RequestError } from '@/service/request';
import { go } from '@/utils/navigate';
import { usePageOperation } from './page-operation';

/** 无服务端幂等键的创建接口：网络结果未知时跨刷新保留防重标记，不自动重发。 */
export function useSubmissionGuard(kind: 'withdraw' | 'recharge' | 'finance', historyUrl: string) {
  const userStore = useUserStore();
  const uncertain = ref(false);
  const running = ref(false);
  const page = usePageOperation(() => { running.value = false; uncertain.value = false; });
  function key() {
    if (!userStore.realUserId) throw new Error('请先登录并加载账户资料');
    return `bw_h5_submission_guard_v1:${String(userStore.realUserId)}:${kind}`;
  }
  function refresh() {
    uncertain.value = !!userStore.realUserId && !!uni.getStorageSync(key());
  }
  onShow(refresh);
  function review() { go(historyUrl); }
  async function acknowledge() {
    if (!page.visible.value || running.value || !userStore.realUserId) return;
    const operation = page.capture();
    const recordKey = key();
    const result = await uni.showModal({
      title: '已核对上次记录？',
      content: '只有确认上次请求未生成记录，或本次确实是一笔新的操作，才可解除本机防重保护。解除不会撤销、退款或改变后台记录。',
      confirmText: '已核对', cancelText: '返回核对'
    });
    if (!result.confirm || !operation.isCurrent() || running.value || !userStore.realUserId || key() !== recordKey) return;
    uni.removeStorageSync(recordKey);
    refresh();
  }
  async function run<T>(send: () => Promise<T>): Promise<T> {
    const operation = page.capture();
    if (!operation.isCurrent()) throw new Error('请返回操作页面后重新确认');
    const recordKey = key();
    refresh();
    if (running.value || uncertain.value) throw new Error('上次提交结果尚未确认，请先到记录页核对，不要重复提交');
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    uni.setStorageSync(recordKey, marker);
    if (uni.getStorageSync(recordKey) !== marker) throw new Error('无法保存防重记录，本次未提交');
    running.value = true;
    uncertain.value = true;
    try {
      const result = await send();
      if (result === undefined || result === null || result === '') throw new Error('提交回执缺失');
      // 收到成功回执后，存储清理失败也不能将业务成功改报为失败。
      try { if (uni.getStorageSync(recordKey) === marker) uni.removeStorageSync(recordKey); } catch { /* 保守保留防重提示。 */ }
      return result;
    } catch (error) {
      const rejected = error instanceof RequestError && (error.kind === 'business' || error.kind === 'config'
        || (error.kind === 'unauthorized' && !error.message.includes('会话已切换')));
      if (rejected) {
        try { if (uni.getStorageSync(recordKey) === marker) uni.removeStorageSync(recordKey); } catch { /* 保留待核对状态。 */ }
        throw error;
      }
      throw new Error('请求结果尚未确认，请先核对记录；本机已阻止重复提交');
    } finally {
      if (operation.sameSession()) {
        running.value = false;
        try { refresh(); } catch { uncertain.value = true; }
      }
    }
  }
  return { uncertain, running, refresh, review, acknowledge, run };
}
