import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import uniPkg from '@dcloudio/vite-plugin-uni';

// UniApp 插件以 CJS 暴露，Node ESM 加载时 default 是整个 module.exports 对象，需再取一次 .default
const uni = (uniPkg as unknown as { default: () => any }).default;

function createH5Proxy(env: Record<string, string>): Record<string, string | ProxyOptions> {
  const services = [
    ['VITE_REAL_USER_BASE_URL', 'VITE_REAL_USER_TARGET_URL', 'https://testhou.merchantsale.store/api/user'],
    ['VITE_REAL_ORDER_BASE_URL', 'VITE_REAL_ORDER_TARGET_URL', 'https://testhou.merchantsale.store/api/order'],
    ['VITE_REAL_ADMIN_BASE_URL', 'VITE_REAL_ADMIN_TARGET_URL', 'https://testhou.merchantsale.store/api/admin'],
    ['VITE_REAL_NOTIFY_BASE_URL', 'VITE_REAL_NOTIFY_TARGET_URL', 'https://testhou.merchantsale.store/api/notify']
  ] as const;

  return Object.fromEntries(
    services
      .map(([baseKey, targetKey, fallbackTarget]) => {
        const baseURL = env[baseKey];
        if (!baseURL?.startsWith('/')) return undefined;
        return [
          baseURL,
          {
            target: env[targetKey] || fallbackTarget,
            changeOrigin: true,
            ws: baseKey === 'VITE_REAL_NOTIFY_BASE_URL',
            rewrite: (path: string) => path.replace(baseURL, '')
          }
        ];
      })
      .filter((item): item is [string, ProxyOptions] => !!item)
  );
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [uni()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/mock', import.meta.url))
      }
    },
    server: command === 'serve' ? { proxy: createH5Proxy(env) } : undefined,
    css: {
      preprocessorOptions: {
        scss: {
          // wot-design-uni 的 SCSS 用了 Dart Sass 3 里废弃的 legacy 语法
          // (nth/length/unquote/@import)，是上游问题，短期无法升级。
          // 静默这些噪音警告，只保留真实构建错误。
          silenceDeprecations: [
            'legacy-js-api',
            'global-builtin',
            'import',
            'color-functions',
            'slash-div',
            'if-function'
          ],
          quietDeps: true
        }
      }
    }
  };
});
