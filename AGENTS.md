# AGENTS.md 核心开发规范

## Summary

项目是油宝 C 端 H5，基于 `UniApp + Vue 3 + TypeScript + Pinia + wot-design-uni`。唯一交付端为移动 H5、Android App 与 iOS App，采用 App-Vue 路线；后续接口对接沿用后台项目的处理原则：前端现有交互和业务行为优先，接口路径、字段、类型、枚举、分页及响应结构以后端 Swagger 为准。

## 跨设备承接

- 本项目始终使用当前 `main` 分支承接开发，不为跨设备同步额外创建功能分支或 WIP 分支。
- 用户说“继续承接当前项目开发”时，先执行 `git status -sb`；工作区干净时执行 `git fetch origin` 和 `git pull --ff-only`，存在本地修改时先检查，不覆盖、不重置、不直接拉取。
- 同步后读取 `AGENTS.md`、`README.md`、`docs/api-integration-plan.md`、`docs/api-swagger-match-matrix.md` 和最新提交，确认已完成、未完成、验证结果、阻塞与下一步后自主继续。
- 锁文件变化或缺少依赖时才重新安装依赖；测试账号优先读取 Git 忽略文件 `.h5-test-account.local`，本地环境变量和 Chrome 登录状态在两台电脑分别安全配置。
- 任务未完成但需要换电脑时，允许将当前进度提交并推送到 `main`；必须标记为“部分完成”，不得描述为任务已完成。需要把未完成项和下一步写入项目承接内容时，用户应明确说“推送和更新承接”。
- 未完成进度推送前至少执行 `git diff --check`，排除敏感信息、本地配置、临时产物和其他任务文件；其他检查未运行或未通过时如实记录。
- 未完成进度提交使用简洁中文，例如 `chore: 保存订单模块未完成进度`；不使用 `git stash` 进行跨设备承接，也不默认改写已推送的进度提交历史。

## Core Rules

### 代码风格

- 项目统一使用 2 空格缩进。
- 新增和修改代码保持当前文件风格，不做无关格式化或重构。
- Vue 文件继续使用 `<script setup lang="ts">`，顺序保持 `script` → `template` → `style scoped`。
- 页面使用 UniApp 生命周期、导航和跨端组件，不替换为仅浏览器可用的实现。

### 页面与组件

- 页面放在 `src/pages/<module>/`，路由和 tabBar 继续由 `src/pages.json` 管理。
- 页面负责加载、分页、筛选和交互编排；可复用 UI 放 `src/components/<module>/` 或 `src/components/common/`。
- Pinia 状态放 `src/stores/`；通用工具放 `src/utils/`；全局样式只保留主题变量、reset 和跨页面基础样式。
- 不改变当前按钮、弹窗、筛选、分页、跳转、空态和操作顺序，除非用户明确要求。

### 请求封装与接口对接

- 当前 `@shared` 指向本项目 `src/mock/`，是本地 Mock 入口，不是网络请求库。
- 当前 Mock 由页面或 Store 直接调用 `src/mock/api/*.ts` 的异步函数，并通过 `Promise + setTimeout` 模拟延迟；不经过 Axios、`fetch`、`uni.request`、Vite 代理或浏览器 Mock adapter。
- 未正式对接的模块继续保持现有 `@shared` Mock URL 无关的函数调用、入参、返回结构和页面行为，不为统一格式批量改造。
- 模块正式对接时，新建并复用 `src/service/request/` 与 `src/service/api/<module>.ts`；页面和 Store 只调用 API 文件，不直接调用底层 request。
- 真实请求层的职责与后台项目保持一致：集中处理 baseURL、`X-Access-Token`、成功码、业务错误、登录失效、响应解包和错误提示；不做真实接口失败后自动回退 Mock。
- PC/H5 与后台共用 Swagger，但只接入 C 端页面实际需要的接口；不得因 Swagger 存在而扩展前端交互。
- H5 请求底层必须使用 `uni.request`，集中处理 baseURL、超时、`X-Access-Token`、响应解包、业务错误和登录失效；不得复制 c-pc 的 `fetch`/`window` 实现，也不得使用后台的 Axios browser adapter。
- 页面和 Store 禁止直接使用 `window`、`document`、`localStorage`、`sessionStorage`、Vue Router 或浏览器重定向；存储、跳转、剪贴板和网络能力一律经 UniApp API 或项目封装。
- H5 开发/测试可临时使用 HTTP 或 HTTPS 服务；Android/iOS App 请求仅允许 HTTPS，不为 iOS 配置明文 HTTP 例外。H5 的代理/CORS 和 HTTP 地址不能成为 App 的请求依赖。
- 真实接口字段与现有页面字段不一致时，优先在 API/adapter 边界转换；页面交互不变，字段和类型以后端返回为准。

### 类型与 ID

- 当前 Mock 类型保留在 `src/mock/typings/api/`，不为文档统一迁移。
- 新增真实接口类型统一放 `src/typings/api/<module>.d.ts`，使用 `declare namespace Api.<Module>`；若目录尚不存在，随首个正式对接模块创建。
- 查询参数使用 `XxxQuery`，写操作参数使用 `XxxParams` / `XxxSaveParams`。
- 所有业务 ID 默认视为可能的 Long。真实响应、行键、选择状态、关联比较和写操作必须保留原始值，不随意使用 `Number()`、`parseInt()` 或算术转换。
- 已存在的 Mock `number` ID 只作为后续模块对接治理项；未进入正式对接范围时不批量修改。

### Mock 与共享代码边界

- `src/mock/` 是项目内置副本；虽与 PC 当前内容一致，但两个仓库没有运行时共享依赖。
- 不直接从页面新增对 `src/mock/mock/data/*` 的依赖；正式接口对接应经 `src/service/api/` 进入。
- 不把当前函数型 Mock 误判为可由 Axios adapter 自动拦截。若未来需要网络型 Mock，应单独确认方案，并保持真实请求实例隔离。
- 不为了 PC/H5 去重而跨项目搬迁或建立工作区共享包，除非用户明确要求。

### 三端 UI 与构建边界

- H5、Android、iOS 均使用 `pages.json` 配置的窗口级原生 tabBar；严禁在页面内容中渲染底栏。五个一级页面只负责内容，入口和跳转语义必须一致。
- 默认顶部导航同样由 `pages.json` 的窗口级导航栏承载；仅首页业务搜索头、登录页无导航、商品详情浮层返回和钱包 Hero 导航可使用 `navigationStyle: custom`，新增例外须说明原因并完成三端验收。
- H5 专用 DOM 选择器和滚动条美化必须置于 `#ifdef H5` 中；不得以 CSS 隐藏框架 tabBar，也不得依赖 CSS 控制 App 原生 tabBar。
- 图标使用项目内本地 PNG/WebP 资源；不得在 App 页面中依赖 Iconify Vue、在线图标服务或内联 SVG。
- 新增/修改页面必须避免 `backdrop-filter`、依赖浏览器 viewport 的 `100vh` 和未经真机验证的 CSS Grid；固定操作栏必须复用安全区处理。
- 目标兼容基线为 Android 8+、iOS 13+。日常开发先完成移动 H5 的 Chrome 回归；Android/iOS 真机验证在模块里程碑或交付验收阶段集中完成，覆盖安全区、软键盘、返回、列表滚动和错误提示。

### 文档与状态口径

- `docs/` 仅允许保留 `api-integration-plan.md` 和 `api-swagger-match-matrix.md`。未经用户明确允许，不得在 `docs/` 中新增、生成、复制、恢复其他文件或子目录。
- 接口计划和核对记录统一维护在上述两个文件中，说明使用中文，技术标识保持原样。
- `docs/api-integration-plan.md` 顶部维护唯一的“当前承接状态”，记录当前分支、已完成、未完成、验证结果、阻塞和下一步，准确提交位置以 Git HEAD 为准；当前实施阶段和范围以该文件为准，不在本规则中固定阶段编号。
- `docs/api-swagger-match-matrix.md` 只维护能力、契约、API 封装、页面调用和真实验证状态；普通状态变化优先更新现有章节或表格，不重复追加日期流水账。
- 跨设备或新会话继续工作时，必须先读取 `README.md`、接口计划和 Swagger 矩阵，再结合 live Swagger 和当前代码确认状态；项目文档不能替代实时契约复核。
- 共用 Swagger 入口以 `docs/api-integration-plan.md` 记录为准，地址变化只维护文档，不凭记忆修改代码。
- “Swagger 接口存在”“API 已封装”“页面已调用”“真实接口已验证”必须分开描述。
- 文档中的待对接项和治理标记不自动授权修改页面、Mock、类型或接口映射。
- 每个新真实接口模块在写代码前，先读取 live `swagger-config`，再抓取当前模块及依赖模块对应的 Swagger 分组；涉及通知或 IM 时同时核对 `notify`。递归比较路径、方法、参数、必填项、requestBody、response 与 schema 字段，状态变化时更新接口计划和匹配矩阵。

### 项目进度查看

- 当前目录位于本项目或其子目录，且用户说“查看项目进度”“查看整体进度”时，只统计 `c-h5`；用户明确指定其他范围时按指定范围执行。
- 统计前检查当前分支、工作区、README、接口计划、Swagger 矩阵、当前代码和最近提交；涉及接口满足度时刷新 live Swagger，不沿用历史接口数量或旧百分比。
- 按项目实际梯队优先级展示。每项能力按“契约确认、API/核心逻辑完成、页面接入、真实数据验证”四层统计，每层计 25%。
- 每个梯队同时展示实施进度、真实验收率和统计基数，并列出已完成、部分完成、未完成、当前阻塞、缺少条件和下一步。
- 接口存在但页面未调用、只有空态验证、缺少非空数据、写操作或三端约定验收时，不得标记为完整完成。
- 不默认重新执行完整浏览器或三端真机回归；真实验证状态以最近一次有明确证据的记录为准，并标注验证边界。

### Git 与开发检查

- 使用项目现有 `pnpm` 和脚本，不切换包管理器，不升级依赖。
- 用户明确要求提交时，先检查变更，只提交本次任务文件；commit message 使用简洁中文规范格式。
- TypeScript、接口类型或公共逻辑变化时运行 `pnpm typecheck`；页面交互修改使用 Chrome 移动视图回归，但不为普通任务新增测试文件。
- 构建配置、环境代理或跨端基础能力变化时运行对应的 `pnpm build:h5` 或 `pnpm build:app-plus`；普通页面修改不强制构建。
- 如果应用已经运行，优先查看现有终端或控制台，不重复启动。
- 用户只说“推送”或任务按规则自动推送时，正常完成本次任务所需的代码和对应文档更新；接口计划、Swagger 矩阵或其他项目文档应按实际状态变化同步更新，但不更新“当前承接状态”。
- 只有用户明确说“推送和更新承接”时，才在正常任务文档更新基础上额外更新“当前承接状态”，并将代码、任务文档与承接信息在同一批次提交推送；实际状态未变化时不做只有日期变化的文档修改。
- 正常任务未通过适用验证时不得描述为完成；跨设备未完成进度允许推送，但必须按“部分完成”记录检查结果、阻塞和下一步。
- 推送后执行远端同步检查，确认当前分支、最新提交和工作区状态可供另一台电脑直接承接。
- 完成后说明修改范围、运行情况、相关报错和待确认问题。

## Assumptions

- 后续真实接口接入继续沿用现有 UniApp 架构，不重构为纯浏览器 Vue 应用。
- 后台项目只作为接口治理、请求边界和文档习惯参考，不形成代码级依赖。
