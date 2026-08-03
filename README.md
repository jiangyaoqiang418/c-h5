# 油宝 C 端 H5

基于 `UniApp + Vue 3 + TypeScript + Pinia + wot-design-uni` 的油宝 C 端跨端项目，交付移动 H5、Android App 与 iOS App。

## 环境与命令

项目使用 `pnpm`。

```bash
pnpm install
pnpm dev:h5
pnpm build:h5
pnpm dev:app-plus
pnpm build:app-plus
pnpm typecheck
```

- H5 开发默认由 UniApp/Vite 启动。
- H5 构建产物位于 `dist/build/h5`。
- 当前仅维护移动 H5、Android App 与 iOS App；小程序和其他端暂不构建、不验收。
- Android/iOS 采用 UniApp App-Vue。当前 H5 开发可使用 HTTP 测试服务；App 请求必须使用 HTTPS。签名、商店发布和热更新不在当前阶段。

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
- 当前没有 Axios、`fetch` 或真实 API 请求封装。后续真实请求只使用 `uni.request`；不得复制 PC 或后台项目的浏览器请求实现。
- 当前 Mock 不经过网络，因此不能直接使用后台项目的 Axios browser adapter 进行拦截。
- PC 与 H5 的 `src/mock/` 当前内容一致，但分别存放在两个项目中，运行时互不依赖。

## 真实接口对接约定

- C 端与后台系统共用 Swagger / Knife4j：`http://221.128.249.198:8902/doc.html`。
- 交互逻辑以前端现有页面为准；路径、字段、类型、枚举、分页和响应结构以后端接口为准。
- 后续按模块建立 `src/service/request/`、`src/service/api/` 和 `src/typings/api/`，请求职责与后台项目保持一致。
- 未对接模块继续使用现有 Mock；已切真实接口的模块不自动 fallback Mock。
- H5 的底层传输实现需兼容目标 UniApp 运行端，正式实施时单独确认。
- 页面/Store 不直接使用浏览器的 `window`、`localStorage`、`fetch` 或 Vue Router；存储、跳转和网络能力统一使用 UniApp API。
- H5、Android/iOS 均使用 `pages.json` 的窗口级原生 tabBar；页面仅渲染内容，图标使用项目内本地图片资源。
- 默认顶部导航由 `pages.json` 承载；首页、登录、商品详情和钱包是已登记的自定义导航例外。
- 每个真实接口模块在编码前都要实时比较 Swagger 的路径、参数、请求体、响应和 schema，并更新接口矩阵。

详细规则见：

- [AGENTS.md](./AGENTS.md)
- [真实接口接入计划](./docs/api-integration-plan.md)
- [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)

## 当前 Swagger 满足度

2026-07-28 已完整扫描全部 41 个页面、33 个组件、4 个 Store 和当前使用的 Mock API。2026-08-03 重新确认 `admin`、`user`、`order` Swagger 可读取，其中 `admin` 已由 83 路径/84 操作变为 84 路径/85 操作，真实模块迁移前必须完成最新递归差异审查：

- P2 首批已完成 H5 真实读取验证：登录、当前用户、积分账户、分类树、钱包总览均经本地 `/api/*` 代理返回 HTTP 200 / 成功码 `1`；提现创建仅完成 adapter 和页面接入，尚未发起真实写入。

- 当前实际调用的 65 项 Mock API 能力中，17 项可直接或通过 API 层适配接入，19 项仅有部分后端能力，29 项在当前 Swagger 中缺失。
- 可直接/适配接入口径约为 `26%`；计入部分覆盖后约为 `55%`。该比例只表示接口能力匹配，不代表页面已完成真实接口对接。
- 主要缺口为地址、公开商品分页筛选、完整订单字段与状态、KYC、理财、评价、IM/通知、CMS、AI 和完整售后。
- 逐模块路径、字段差异及后端补充项见 [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)。

## 开发边界

- 保留现有页面流程、筛选、分页、弹窗、跳转和空态。
- 优先在请求/API adapter 边界处理后端字段差异。
- 不做无关重构、不升级依赖、不批量修改历史 Mock 或 ID 类型。
- 默认不运行开发、类型检查或构建命令，除非任务明确要求。
- 当前只实施 P0-P2；支付、KYC 相机/上传、IM/推送、正式签名、商店发布和热更新属于后续 P3/P4。
