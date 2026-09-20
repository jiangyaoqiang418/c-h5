export function showCompleteError(error: unknown, fallback: string) {
  const content = error instanceof Error ? error.message : fallback;
  if (content.length > 24) return uni.showModal({ title: '操作失败', content, showCancel: false });
  return uni.showToast({ title: content, icon: 'none' });
}
