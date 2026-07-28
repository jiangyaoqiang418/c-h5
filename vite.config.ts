import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import uniPkg from '@dcloudio/vite-plugin-uni';
import tailwindcss from '@tailwindcss/vite';

// UniApp 插件以 CJS 暴露，Node ESM 加载时 default 是整个 module.exports 对象，需再取一次 .default
const uni = (uniPkg as unknown as { default: () => any }).default;

export default defineConfig({
  plugins: [uni(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/mock', import.meta.url))
    }
  },
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
});
