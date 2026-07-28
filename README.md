# 油宝 C 端 H5

基于 `UniApp + Vue 3 + TypeScript + Pinia + wot-design-uni + Tailwind CSS` 的油宝 C 端 H5 项目。

## 环境与命令

项目使用 `pnpm`。

```bash
pnpm install
pnpm dev:h5
pnpm dev:mp-weixin
pnpm build:h5
pnpm typecheck
```

- H5 开发默认由 UniApp/Vite 启动。
- H5 构建产物位于 `dist/build/h5`。
- 当前仍保留微信小程序构建脚本；正式接入真实请求前需确认目标运行端。

## 目录

```text
src/
├── pages/                 # UniApp 页面
├── components/            # 业务与通用组件
├── stores/                # Pinia
├── mock/                  # 当前本地 Mock API、类型、数据和工具
├── utils/                 # H5 通用工具
├── static/                # 静态资源
├── pages.json             # 页面路由与 tabBar
└── manifest.json          # UniApp 配置
```

`@shared` 和 `@shared/*` 都指向本项目的 `src/mock/`，不是外部共享包。

## 当前数据与请求状态

- 页面和 Store 通过 `@shared` 直接调用 `src/mock/api/*.ts`。
- Mock 使用内存数据和 `Promise + setTimeout` 模拟异步与分页。
- 当前没有 Axios、`fetch`、`uni.request` 请求封装，没有真实 API baseURL，也没有 Vite API 代理。
- 当前 Mock 不经过网络，因此不能直接使用后台项目的 Axios browser adapter 进行拦截。
- PC 与 H5 的 `src/mock/` 当前内容一致，但分别存放在两个项目中，运行时互不依赖。

## 真实接口对接约定

- C 端与后台系统共用 Swagger / Knife4j：`http://221.128.249.198:8902/doc.html`。
- 交互逻辑以前端现有页面为准；路径、字段、类型、枚举、分页和响应结构以后端接口为准。
- 后续按模块建立 `src/service/request/`、`src/service/api/` 和 `src/typings/api/`，请求职责与后台项目保持一致。
- 未对接模块继续使用现有 Mock；已切真实接口的模块不自动 fallback Mock。
- H5 的底层传输实现需兼容目标 UniApp 运行端，正式实施时单独确认。

详细规则见：

- [AGENTS.md](./AGENTS.md)
- [真实接口接入计划](./docs/api-integration-plan.md)
- [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)

## 当前 Swagger 满足度

2026-07-28 已完整扫描全部 41 个页面、33 个组件、4 个 Store 和当前使用的 Mock API：

- 当前实际调用的 65 项 Mock API 能力中，17 项可直接或通过 API 层适配接入，19 项仅有部分后端能力，29 项在当前 Swagger 中缺失。
- 可直接/适配接入口径约为 `26%`；计入部分覆盖后约为 `55%`。该比例只表示接口能力匹配，不代表页面已完成真实接口对接。
- 主要缺口为地址、公开商品分页筛选、完整订单字段与状态、KYC、理财、评价、IM/通知、CMS、AI 和完整售后。
- 逐模块路径、字段差异及后端补充项见 [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)。

## 开发边界

- 保留现有页面流程、筛选、分页、弹窗、跳转和空态。
- 优先在请求/API adapter 边界处理后端字段差异。
- 不做无关重构、不升级依赖、不批量修改历史 Mock 或 ID 类型。
- 默认不运行开发、类型检查或构建命令，除非任务明确要求。
