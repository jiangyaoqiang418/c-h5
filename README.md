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
- H5 部署包使用同源 `/api/*` 请求地址，部署服务器必须把 `/api/user`、`/api/order`、`/api/admin` 反向代理到对应测试服务；不要让浏览器直接跨域访问测试服务，否则会触发 CORS。
- 当前仅维护移动 H5、Android App 与 iOS App；小程序和其他端暂不构建、不验收。
- Android/iOS 采用 UniApp App-Vue。`dev:app-plus` 与 `build:app-plus` 固定加载 `.env.app`，使用完整 HTTPS 测试服务地址，不依赖 H5 的 Vite 代理。签名、商店发布和热更新不在当前阶段。
- HBuilderX 直接运行 App 时会加载 development 环境；请求配置在 App 端使用 `.env.development` 的 `VITE_REAL_*_TARGET_URL`，H5 仍使用 `/api/*` 代理。
- 当前功能实施与真实接口回归以 H5 为先行端，但代码仍须保持 Android/iOS 可兼容；App 端不阻塞 H5 后续推进，H5 完成后再集中回归。
- 本机 H5 真实接口测试账号保存在 Git 忽略文件 `.h5-test-account.local`，自动化或人工回归优先读取该文件，禁止把密码写入可提交文档或远端历史。

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

- 已迁移页面和 Store 调用 `src/service/api/`，未迁移模块继续通过 `@shared` 调用 `src/mock/api/*.ts`。
- Mock 使用内存数据和 `Promise + setTimeout` 模拟异步与分页。
- 当前已建立基于 `uni.request` 的真实请求封装，并接入登录、当前用户、积分账户、积分流水/申诉/申诉记录、分类树、首页商品读取、买手商品管理、钱包总览/流水/充提记录/充值创建、提现创建、买手申请提交/状态和求购创建/列表/详情/撤销/抢单；项目不使用 Axios 或 `fetch`。
- 当前 Mock 不经过网络，因此不能直接使用后台项目的 Axios browser adapter 进行拦截。
- PC 与 H5 的 `src/mock/` 当前内容一致，但分别存放在两个项目中，运行时互不依赖。

## 真实接口对接约定

- C 端与后台系统共用 Swagger / Knife4j：`http://221.128.249.198:8902/doc.html`。
- 交互逻辑以前端现有页面为准；路径、字段、类型、枚举、分页和响应结构以后端接口为准。
- 后续模块复用现有 `src/service/request/`，并按模块补充 `src/service/api/` 和 `src/typings/api/`。
- 未对接模块继续使用现有 Mock；已切真实接口的模块不自动 fallback Mock。
- H5 的真实请求统一使用 `uni.request`，开发环境通过 Vite `/api/*` 代理访问测试服务，部署环境通过服务器 `/api/*` 反向代理访问测试服务。
- 页面/Store 不直接使用浏览器的 `window`、`localStorage`、`fetch` 或 Vue Router；存储、跳转和网络能力统一使用 UniApp API。
- H5、Android/iOS 均使用 `pages.json` 的窗口级原生 tabBar；页面仅渲染内容，图标使用项目内本地图片资源。
- 默认顶部导航由 `pages.json` 承载；首页、登录、商品详情和钱包是已登记的自定义导航例外。
- 每个真实接口模块在编码前都要实时比较 Swagger 的路径、参数、请求体、响应和 schema，并更新接口矩阵。

详细规则见：

- [AGENTS.md](./AGENTS.md)
- [真实接口接入计划](./docs/api-integration-plan.md)
- [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)

## 当前 Swagger 满足度

2026-07-28 已完成历史 Mock 能力扫描。2026-08-05 再次确认 `admin`、`user`、`order` Swagger 可读取，当前为 84 路径/85 操作、19/19、40/42，`notify` 仍为 HTTP 404；真实模块迁移前必须完成最新递归差异审查：

- P2 首批已完成 H5 真实读取验证：登录、当前用户、积分账户、积分流水、分类树、钱包总览均经本地 `/api/*` 代理返回 HTTP 200 / 成功码 `1`；“我的”页总资产和 VIP 当前状态已统一读取真实账户数据。提现创建和积分申诉仅完成 adapter/页面接入或读取前置验证，尚未发起真实写入。
- 钱包首页最近交易与资金流水页已调用真实 `POST /user/wallet/ledger/page`；当前测试账号流水为 `0`，Chrome 空态回归通过。
- 求购创建、我的求购、详情和撤销已完成真实接口闭环；普通顾客访问求购大厅时遵循后端买手权限，不回退 Mock。抢单已接入但仍需已通过 KYC 的买手账号验证。
- 买手申请已接入 `POST /user/buyer/apply` 与 `GET /user/buyer/application`，可从身份切换或“我的”进入申请页查看未申请、审核中、已通过和已驳回状态；真实提交写入尚待合适测试账号验证。

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
