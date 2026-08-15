# c-h5 Codex 续开发记忆

> 更新时间：2026-08-15
> 用途：在新的 Codex 任务中继续开发时，先完整读取本文件，再读取 `AGENTS.md`、`README.md`、`docs/api-integration-plan.md` 和 `docs/api-swagger-match-matrix.md`。本文是交接摘要，实时 Swagger、当前源码和 Git 状态仍是最终事实来源。

## 1. 新会话直接执行

### 默认自主执行规则

- 用户已授权 Codex 按已知目标、Swagger、源码和项目计划自主推进；常规检查、代码修改、测试、文档同步、Chrome 页面回归及可恢复的 QA 操作无需逐步征求确认。
- 仅在缺少完成任务所必需的条件（例如账号、权限、测试数据、接口/环境不可用、需求口径冲突）时暂停并说明具体阻塞与所需条件；不要把一般执行步骤、可验证假设或可恢复测试操作变成反复确认。
- 仍须遵守平台的即时安全确认要求，以及用户明确要求暂停、限制范围或改由其本人操作的情形；确认后自行继续后续计划，不要求用户重复授权。

```text
工作目录：/Users/yaoqiangjiang/Desktop/w3/c-h5

先执行：
1. 完整读取 AGENTS.md 和 docs/codex-handoff-memory.md。
2. 执行 git status -sb、git log -5 --oneline，保护用户未提交的 src/pages.json。
3. 读取 README.md、docs/api-integration-plan.md、docs/api-swagger-match-matrix.md。
4. 执行 pnpm swagger:check，确认实时契约相对 2026-08-14 基线是否漂移。
5. 默认使用用户现有 Chrome，在 DevTools 设备工具栏选择 `iPhone 15 Pro` 调试 H5；不得通过修改页面代码或自动化 viewport 覆盖来代替该设备模拟。本阶段略过 Android/iOS 真机调试。
6. 从“商品收藏闭环”开始，不自动进入 IM/推送、KYC 原生上传或发布能力。
```

## 2. 仓库与 Git 状态

| 项目 | 当前值 |
|---|---|
| 仓库 | `git@github.com:jiangyaoqiang418/c-h5.git` |
| 分支 | `main` |
| 本地 HEAD | `6b1323a7aac2bea6daa419f30e94adbe7c66b5f8` |
| 远端状态 | 截至本文生成时，`main` 与 `origin/main` 同步 |
| 最新提交 | `6b1323a feat: 支持待付款订单继续支付` |
| 未提交文件 | `src/pages.json` |

`src/pages.json` 的未提交内容是 HBuilderX 自动增加的本地运行 `condition` 配置。它属于用户本地调试状态：

- 不要删除或覆盖。
- 不要随业务提交一起暂存或推送。
- 如果后续业务确实必须修改 `pages.json`，先分离业务改动与本地 `condition`，只提交业务部分。

最近关键提交：

| 提交 | 内容 |
|---|---|
| `6b1323a` | 待付款订单从列表、详情继续真实支付 |
| `e8c82ca` | 补齐买手退款真实回归证据 |
| `5cd972e` | 真实商品立即购买进入真实结算 |
| `baabbb8` | 收敛 AI/IM 页面高度和滚动容器 |
| `35074e6` | 放行全真实购物车进入真实结算 |
| `d36de9c` | 订单详情仅退款入口收敛 |

## 3. 强制技术边界

- 技术栈：`UniApp + Vue 3 + TypeScript + Pinia + wot-design-uni`，采用 App-Vue。
- 唯一目标端：移动 H5、Android、iOS；其他小程序端不维护、不验收。
- H5 当前可使用 HTTP/HTTPS 和 Vite 代理；Android/iOS 正式请求必须为 HTTPS。
- 页面和 Store 禁止直接使用 `window`、`document`、`localStorage`、`fetch`、Vue Router 或 Axios browser adapter。
- 请求统一经过 `src/service/request/` 的 `uni.request`；token 使用项目跨端存储封装。
- 真实接口失败后绝不回退 Mock。尚未迁移的模块继续保留原 Mock，不做批量重构。
- Java Long ID 保持 `string | number` 原值，不得随意 `Number()`、`parseInt()`。
- 后端字段差异集中在 API/adapter 处理，尽量不改变页面既有交互。
- tabBar 和默认顶部导航由 `src/pages.json` 的窗口层管理，页面内容里不重复渲染底栏。
- 当前阶段略过真机证据，但不能把 Chrome 验证写成 Android/iOS 真机验证完成。

## 4. Swagger 与环境

Swagger 入口：`http://221.128.249.198:8902/doc.html`。

最新已提交基线：`docs/swagger-baselines/2026-08-14/`。

| 分组 | HTTP | 路径 | 操作 | Schema |
|---|---:|---:|---:|---:|
| `admin` | 200 | 116 | 117 | 207 |
| `user` | 200 | 33 | 33 | 66 |
| `order` | 200 | 45 | 47 | 66 |
| `notify` | 200 | 16 | 16 | 22 |

常用命令：

```bash
pnpm swagger:check
pnpm swagger:baseline       # 只有确认要更新基线时执行
pnpm typecheck
pnpm build:h5
pnpm build:app-plus
pnpm dev:h5
```

环境配置：

- H5 开发通过 `/api/user`、`/api/order`、`/api/admin` 代理访问服务。
- App 环境使用 `.env.app` 中的完整 HTTPS 地址。
- 成功码为 `1`；登录失效码由环境变量统一配置。
- `.env.development.local` 和 `.h5-test-account.local` 均存在且被 Git 忽略。

每次接入新模块前必须先运行 Swagger 检查，并比较路径、方法、参数、必填项、请求体、响应及嵌套 schema。不要依据接口数量或旧文档直接开始写代码。

## 5. 测试账号与浏览器约定

- 两个调试账号已记录在本机 Git 忽略文件 `.h5-test-account.local`，新 Codex 可在本机读取使用。
- 当前真实回归账号昵称包括 `john`；退款买手侧证据中出现过顾客 `mamba`。
- 密码和 token 不得写入本文、普通 Markdown、提交记录或终端汇总；也不得推送远端。
- 默认使用用户现有 Google Chrome 会话，在 DevTools 设备工具栏选择 `iPhone 15 Pro` 进行 H5 回归；不得用自动化临时 viewport 覆盖替代。
- Android/iOS 真机回归按用户要求暂时跳过，等用户回来再补安全区、软键盘、固定栏和滚动证据。

## 6. 已完成并有真实证据的能力

### P0/P1 基础

- UniApp 三端依赖、H5/App-Vue 构建脚本、App 基础 manifest 已建立。
- `uni.request` 请求层、token 存储、baseURL、成功码、业务错误、网络错误和登录失效已统一。
- Tailwind/Iconify 运行链已移除，图标改为本地资源。
- 原生 tabBar、H5 导航占位、页面滚动、高度、固定操作栏和底部空白已进行多轮整改。
- 登录页无顶部导航、内容不滚动；退出登录会清理状态并重新进入登录页。
- 分类左右区域使用独立滚动容器；购物车结算栏、个人页和 AI/IM 页面高度已修复。

### 账户与基础数据

- 邮箱登录、当前用户、分类树、积分账户、钱包总览已接真实接口并验证。
- 地址列表、新增、详情、设默认、删除已接入；真实隔离写回归完成。
- 钱包流水、充值/提现列表和详情、积分流水、积分申诉列表已接入；空态已验证，部分非空/写入证据仍缺数据。
- 买手申请状态、身份同步和角色切换已接入；当前账号可进入买手视角。

### 商品、购物车与结算

- 首页推荐、热销、新品、秒杀、Banner、公开商品分页/详情、浏览打点已接真实接口。
- 真实商品可以加入本地购物车；Mock 与真实商品严格区分。
- 全真实购物车可进入结算；混入 Mock 商品时阻止真实结算。
- 真实地址、钱包余额、`create-batch`、幂等键、订单组号和 `group/pay` 已接入。
- 真实商品“立即购买”已进入真实购物车和结算流程。
- 待付款订单可在订单列表和详情继续按订单组支付。

### 订单与仅退款

- 顾客买入订单、买手卖出订单的真实分页和详情已接入。
- 后端 7 个原始订单状态由 adapter 映射，页面不猜测采购、保修或归档状态。
- 真实取消、买手发货、顾客确认收货已完成专用订单写回归。
- 结算创建、订单组付款以及待付款继续支付均已真实回读。
- 售后已从原五类 Mock 收敛为后端实际支持的“仅退款”：顾客申请、双方列表/详情、顾客撤销已接入并完成回归。

### 求购

- 求购创建、我的求购、详情、撤销、大厅读取和抢单入口已迁移。
- 创建和撤销已有真实写回归；抢单受买手/KYC 数据条件限制。

## 7. 状态口径与仍缺证据的项目

必须区分以下四种状态：

1. Swagger 存在。
2. API 已封装。
3. 页面已调用。
4. 真实请求、响应、页面和错误行为已验证。

当前仍缺或受数据限制的证据：

- Android/iOS 真机回归全部暂缓，不能标记三端验收完成。
- 充值创建在 `TRON/ETH/BSC` 均未成功生成订单，需要后端链配置或日志支持。
- 钱包/充提/积分申诉的非空多页数据不足，主要验证到真实空态。
- 买手商品上传、创建、审核和上下架写入未形成完整真实闭环。
- 买手申请的无申请、驳回、驳回后重提缺专用账号。
- 物流轨迹、完整五类售后、评价、理财、CMS、AI 真实接口仍不足或不存在。
- `notify` REST Swagger 已恢复并较完整，但现有消息/IM 页面仍为 Mock，且属于后续 P3 范围。

## 8. 下一阶段执行计划（暂不做真机）

### 第一批：商品收藏闭环

Swagger 已提供：

- `POST /order/products/favorite`
- `DELETE /order/products/favorite?id=`
- `POST /order/products/favorites/page`

建议实施顺序：

1. 在 `src/typings/api/product.d.ts` 增加收藏分页类型。
2. 在 `src/service/api/product.ts` 增加收藏、取消收藏和收藏分页 adapter。
3. 真实商品详情增加收藏/取消入口；登录前使用既有 `requireLogin`。
4. 复用现有 `pages/product/list`：通过查询参数切换为收藏数据源，避免新增页面和修改当前未提交的 `pages.json`。
5. 在“我的”页增加“我的收藏”入口，跳转到复用后的商品列表。
6. Chrome 手机视图验证“收藏 → 列表出现 → 取消 → 列表移除”，并检查业务错误和 token 失效。
7. 更新两份接口文档，执行类型检查及 H5/App-Vue 构建后再提交推送。

注意：公开商品详情 DTO 没有明确 `isFavorite` 字段。不要前端猜状态；可以通过收藏分页按 Long ID 判断当前商品是否已收藏，或者在实时 Swagger 新增状态字段后再直接读取。

### 第二批：H5 全局回归

使用 Chrome DevTools 的 `iPhone 15 Pro` 设备模拟依次回归：首页、分类、商品列表/详情、购物车、结算、订单列表/详情、仅退款、钱包、地址、积分、买手商品、个人页。重点检查：

- 主内容只占顶部导航与原生 tabBar 之间的区域。
- 页面自身不渲染重复 nav/tabBar。
- 列表触底无多余大块 padding。
- 固定操作栏不遮挡最后一项。
- 分类左右滚动互不干预。
- 登录页和输入页面的软键盘场景在 H5 不产生双滚动。

### 第三批：买手商品管理补证据

- 先验证真实商品列表和详情读取。
- 使用可恢复测试商品验证上下架，并将状态恢复。
- 上传/创建涉及文件写入和测试数据，先确认安全测试资源；不要为了回归污染正式商品。

## 9. 延期与禁止自动扩大的范围

以下内容不因 Swagger 出现就自动实施：

- Android/iOS 真机验收。
- KYC 相机、人脸、证件和原生文件上传。
- IM、WebSocket、系统推送。
- 应用签名、商店发布、热更新。
- 没有专用测试数据时的充值到账、提现、商品创建等不可逆写操作。

支付、订单组支付和仅退款已经由用户在后续明确授权并完成，不再按早期 P3 文档误判为“完全未接入”；但新增支付渠道或原生支付能力仍需要再次确认范围。

## 10. 完成与提交要求

- 新功能完成后，先检查 `git diff`，保护 `src/pages.json` 的用户本地配置。
- 验证至少包括 `pnpm typecheck`、`pnpm build:h5`、`pnpm build:app-plus`；H5 页面改动再补 Chrome 手机视图证据。
- 只有用户明确要求“提交/推送”时才提交和推送；一次提交只包含当前任务文件。
- 文档必须同步记录：契约版本、API 封装、页面调用、真实回归、阻塞原因。
- 最终汇报不要只说“接口已接”，必须说明验证到了哪一层以及哪些证据仍缺失。
