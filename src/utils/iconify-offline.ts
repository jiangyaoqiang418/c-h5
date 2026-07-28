/**
 * 离线注册使用到的 lucide iconify 图标集合
 *
 * 背景：@iconify/vue 默认从 api.iconify.design 网络加载图标数据；
 * 网络失败或 DevTools 切换设备触发的 reload 期间会闪空/持续消失。
 * 用 addCollection 把 @iconify-json/lucide 中我们实际用到的 icon 打进 bundle。
 *
 * 陷阱：lucide 里有些名字是 aliases（如 `home`→`house`、`help-circle`→`circle-question-mark`），
 * 存在 `aliases` map 里而不是 `icons` map；必须解析 parent 才能拿到真实 body。
 */
import { addCollection } from '@iconify/vue';
import iconsJson from '@iconify-json/lucide/icons.json';

const USED_ICONS = [
  'badge-check', 'bell', 'coins', 'crown', 'hand-coins', 'help-circle',
  'home', 'layout-dashboard', 'layout-grid', 'lock', 'map-pin', 'megaphone',
  'message-circle', 'package', 'piggy-bank', 'receipt', 'search', 'send',
  'settings-2', 'shopping-cart', 'sparkles', 'star', 'user', 'wallet', 'wrench',
  'chevron-right', 'arrow-right'
];

interface LucideJson {
  prefix: string;
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
}

export function registerLucideOffline(): void {
  const src = iconsJson as LucideJson;
  const subset: LucideJson['icons'] = {};

  for (const name of USED_ICONS) {
    // 1) 直接命中 icons map
    if (src.icons[name]) {
      subset[name] = src.icons[name];
      continue;
    }
    // 2) 解析 aliases → parent
    const alias = src.aliases?.[name];
    if (alias && src.icons[alias.parent]) {
      subset[name] = src.icons[alias.parent];
    }
  }

  addCollection({
    prefix: 'lucide',
    icons: subset,
    width: src.width ?? 24,
    height: src.height ?? 24
  });
}
