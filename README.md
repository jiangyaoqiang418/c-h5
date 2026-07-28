# BW Shop H5 端原型

UniApp + Vue3 + TS + wot-design-uni 的 H5 端原型工程。

## 启动

```bash
cd client/h5
pnpm install
pnpm dev:h5       # H5 浏览器访问 http://localhost:5174
pnpm build:h5     # 产物 dist/build/h5
pnpm typecheck
```

## 多端打包

```bash
pnpm dev:mp-weixin    # 微信小程序（HBuilderX 或 CLI）
```

> 原型阶段仅在 H5 端验收。

## 目录

```
src/
├── main.ts / App.vue
├── manifest.json          # UniApp 全局配置
├── pages.json             # UniApp 路由 + tabBar
├── pages/                 # 5 主 Tab + 二级页（Phase 5 扩展）
│   ├── index/index.vue    # 首页
│   ├── category/index.vue # 分类
│   ├── purchase/hall.vue  # 求购大厅
│   ├── cart/index.vue     # 购物车
│   └── my/index.vue       # 我的
├── components/
├── stores/                # Pinia
├── static/                # tab 图标 / 占位图
└── styles/tokens.scss
```

Mock 层已内置于 `src/mock/`。`@shared/*` 仅为 H5 内部别名，不依赖仓库根目录的 `shared/`。

## tabBar 图标

`static/tab-*.png` 文件需要 48×48 / 96×96 大小，灰/蓝两版（normal / selected）。
Phase 5 开始前需补齐图标资源；当前缺少不影响 dev 模式（控制台会有 404 警告）。

## 模块进度

- [x] Phase 0：工程骨架（当前）
- [ ] Phase 5：39 页全套（首页 / 分类 / 商品 / 购物车 / 订单 / 钱包 / 理财 / 求购 / 售后 / IM / KYC / VIP / 个人 / 买手中心 / AI 导购 / 公告 / 帮助）
