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
- 当前已建立基于 `uni.request` 的真实请求封装，并接入登录、当前用户、积分账户、积分流水/申诉/申诉记录、收货地址、分类树、首页与公开商品分页、买手商品管理、钱包总览/流水/充提记录/充值创建、提现创建、买手申请提交/状态和求购创建/列表/详情/撤销/抢单；项目不使用 Axios 或 `fetch`。
- 购物车使用 `source + Long productId + 商品快照` 区分真实与 Mock 商品；真实商品已接入真实地址、合并下单、订单组付款与成功页，Mock 商品禁止混入真实结算链。下单上下文保留幂等键和订单组号，创建成功后的付款重试不重复建单。
- 真实订单已迁移买入/卖出分页、详情、取消、确认收货、结算支付、买手发货与仅退款（创建、双方分页、详情、顾客撤销）；后端 7 状态仅在 adapter 映射为既有展示标签，页面不伪造采购、保修或归档等未声明状态。仅退款不扩展为旧的五类 Mock 售后；IM 通知、会话和历史消息已迁移真实 REST，测试网关已完成 `101 + READY`、双账号文本实时到达、已读与撤回回归，断线增量补偿和媒体真实写回归仍待继续验证。
- 当前 Mock 不经过网络，因此不能直接使用后台项目的 Axios browser adapter 进行拦截。
- PC 与 H5 的 `src/mock/` 当前内容一致，但分别存放在两个项目中，运行时互不依赖。

## 真实接口对接约定

- C 端与后台系统共用 Swagger / Knife4j：`http://221.128.249.198:8902/doc.html`。
- 后台协作、审核及测试数据操作统一访问已部署管理站：[https://testhou.merchantsale.store/](https://testhou.merchantsale.store/)；不使用本地后台启动地址。C-H5 的 `localhost:5174` 仅用于本地页面开发和代理验证。
- 后台登录账号以后台项目文档中明确记录的开发、测试或演示账号为准；不在本项目复制或提交任何凭据。
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

2026-08-26 实时 Swagger 为：`admin` 178 路径/179 操作/303 schema，`user` 46/46/90，`order` 65/67/99，`notify` 22/22/35（路径/操作/schema）。C 端共享契约检查已覆盖登录、测试充值到账、地址、订单、仅退款、合并下单、订单组支付、买手发货、确认收货、发起求购、抢单和通知/IM，结果通过。

- 已完成真实回归的主链：地址、公开商品、真实购物车、合并下单、订单组付款、买手发货、顾客签收、仅退款、评价提交、理财申购/锁仓、通知 REST 与 IM REST，以及买手仪表盘和保证金流水读取。
- 当前 H5 真实请求均经 `uni.request`；真实模块失败不回退 Mock。能力匹配、API 封装、页面调用、真实验证和服务可用性必须分开记录，逐模块详情见 [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)。
- 后端当前阻塞：CMS/AI 缺 C 端契约；KYC、IM 媒体、充值/提现、理财提前赎回和评价治理仍需受控测试数据完成真实写回归；订单群断线增量补偿尚待运行时验证。
- 65 项 Mock 能力与早期 A/B/C/D 比例仅是历史扫描基线，不能用于推导当前实施或验收比例。

## 开发边界

- 保留现有页面流程、筛选、分页、弹窗、跳转和空态。
- 优先在请求/API adapter 边界处理后端字段差异。
- 不做无关重构、不升级依赖、不批量修改历史 Mock 或 ID 类型。
- 默认不运行开发、类型检查或构建命令，除非任务明确要求。
- 当前以 H5 为先行端继续完成真实接口回归；WebSocket、媒体上传、三端真机验收、正式签名、商店发布和热更新按后端契约与里程碑分别推进。
