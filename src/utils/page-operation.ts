import { ref } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import { getAccessToken, onSessionChanged } from '@/service/request/token';

/** 表单归属当前会话；普通异步操作绑定显示代次，原生选图允许返回同一个栈页。 */
export function usePageOperation(resetSession: () => void) {
  const visible = ref(true);
  let sessionVersion = 0;
  let pageVersion = 0;
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function clearTimers() {
    timers.forEach(timer => clearTimeout(timer));
    timers.clear();
  }
  const unsubscribe = onSessionChanged(() => {
    sessionVersion++;
    clearTimers();
    resetSession();
  });
  onShow(() => { if (!disposed) visible.value = true; });
  onHide(() => { visible.value = false; pageVersion++; clearTimers(); });
  onUnload(() => {
    disposed = true;
    visible.value = false;
    sessionVersion++;
    clearTimers();
    unsubscribe();
    resetSession();
  });

  function capture() {
    const session = sessionVersion;
    const token = getAccessToken();
    const originPage = getCurrentPages().slice(-1)[0];
    let version = pageVersion;
    let pickerReturned = false;
    const sameSession = () => !disposed && session === sessionVersion && token === getAccessToken();
    const onOriginalPage = () => !!originPage && getCurrentPages().slice(-1)[0] === originPage;
    const isCurrent = () => sameSession() && version === pageVersion && onOriginalPage() && (visible.value || pickerReturned);
    return {
      sameSession,
      isCurrent,
      afterPicker() {
        if (!sameSession() || !onOriginalPage()) return false;
        version = pageVersion;
        pickerReturned = true;
        return true;
      },
      schedule(action: () => void, delay: number) {
        if (!isCurrent()) return;
        const timer = setTimeout(() => { timers.delete(timer); if (isCurrent()) action(); }, delay);
        timers.add(timer);
      }
    };
  }
  return { visible, capture };
}
