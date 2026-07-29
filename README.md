# FreeBBS 发展端

FreeBBS 发展端是挂载在 FreeBBS 主站 `/development/` 路径下的独立业务子页面。它复用主站登录身份和基础用户信息，为组织传承、信息咨询、社群活动以及部门业务提供统一入口、统一权限和可持续扩展的模块框架。

## 当前完成度

仓库当前已形成可运行的平台 MVP：

- 已实现 React Web、版本化 API、内存与 MySQL 两种数据模式；
- 已实现经验库、信息与咨询、趣缘群体、活动、联络资源、体育代表队、财务治理、权限与模块管理等完整入口；工作台路由保留但不在导航中重复展示；
- 已实现主站身份适配器、角色/动作/资源/作用域/Tag 授权、模块注册和审计基础能力；
- 已提供数据库迁移、演示数据、备份脚本、Docker Compose、Nginx 与 systemd 配置；
- 已有单元、接口、权限回归、运维脚本、部署配置、真实浏览器 E2E 与 CI/发布门禁。

目前仍需在实际生产环境中确认主站 `/api/auth/me` 身份契约、域名与 TLS、生产数据库凭据及部署参数。仓库中的 demo 身份和内存数据仅用于本地开发；“代码可运行”不代表生产环境已经上线。

## 功能模块与分工

| 模块 | 主要能力 | 建议负责人 |
| --- | --- | --- |
| 平台核心 | 主站身份对接、统一权限与 Tag、模块注册、公共接口、审计、部署基线 | 项目负责人 / 核心平台组 |
| 经验库 | 流程、常见问题、联系人、活动复盘、培养资料和组织传承 | 核心组定义结构，各部门维护内容 |
| 信息与咨询 | 公告、咨询、反馈和处理状态 | 权益发展团队牵头 |
| 趣缘群体 | 兴趣社群目录、成员协作和公开活动关联 | 联络中心牵头 |
| 活动 | 活动发起、报名、审批与标准流程 | 核心组定义通用流程，各业务团队扩展 |
| 联络资源 | 通讯录、校友、校系级、企业及班团资源 | 联络团队牵头 |
| 体育代表队 | 代表队信息、队长身份、成员和打卡 | 体育团队牵头 |
| 财务治理 | 预决算记录、审批、汇总及活动关联 | 团委相关同学 / 财务治理团队 |

领域团队可以独立开发自己的模块，但必须使用平台统一的身份、权限、审计和接口契约，不自行建立账号系统或直接读取其他模块的数据。模块认领和验收要求见[总体技术设计](./docs/overall-technical-design.md)。

## 身份与权限边界

- 主站是登录状态和基础用户身份的唯一权威来源；发展端不保存主站密码。
- 生产环境通过 Bearer Token 调用主站 `GET /api/auth/me`，再加载发展端内部的角色和 Tag；主站的粗粒度身份不会自动获得发展端管理权限。
- 初始角色覆盖最高权限，文艺/体育/联络/权益发展负责人、部长或主任、部员，团委同学、科协同学和普通同学。
- 体育代表队队长是可与基础角色并存、且必须绑定具体代表队作用域的 Tag；平台保留其他命名空间 Tag 的扩展接口。
- 前端只负责呈现可用操作，API 的默认拒绝、作用域校验和审计才是最终安全边界。

## 本地预览

要求 Node.js `>=20.19.0`。在仓库根目录执行：

```powershell
npm ci
npm run dev
```

然后访问：

- Web：`http://localhost:5173/development/`
- API 健康检查：`http://127.0.0.1:3100/api/development/v1/health`

本地默认使用 `memory + demo`，可在页面中切换以下固定演示身份：

| UID | 用途 |
| --- | --- |
| `demo-student` | 普通同学视角 |
| `demo-admin` | 平台最高权限与后台管理 |
| `demo-rights-member` | 权益发展中心部员与提案池维护 |
| `demo-liaison-member` | 联络中心部员与趣缘群体维护 |
| `demo-sports-lead` | 体育负责人、组织财务与代表队管理 |
| `demo-sports-director` | 体育中心部长、CSV 名单导入 |
| `demo-captain` | 仅篮球队范围内生效的队长 Tag |
| `demo-tuanwei-lead` | 团委负责人、跨组织财务审核 |

进程重启后内存数据会恢复到确定性的演示初始状态。MySQL 联调、环境变量、种子数据与常见问题请按[本地开发与完整预览](./docs/local-development.md)操作。

提交前运行完整质量门禁：

```powershell
npm run check
npx playwright install chromium
npx playwright test
```

`npm run check` 覆盖静态检查、类型、单元/接口/运维/发布策略测试和生产构建；Playwright 另行覆盖真实浏览器身份、导航、提交、作用域权限和响应式布局。CI 会自动安装 Chromium。本机 Chromium 下载受限时，可在已安装 Google Chrome 的机器上显式设置 `PLAYWRIGHT_USE_SYSTEM_CHROME=true` 后运行，不能在 CI 中启用该回退。

## 文档与部署

- [文档索引](./docs/README.md)
- [总体技术设计与开发分工](./docs/overall-technical-design.md)
- [本地开发与完整预览](./docs/local-development.md)
- [服务器部署与运维](./docs/server-deployment.md)
- [数据库与业务数据管理](./docs/data-administration.md)

生产建议采用同源路径：Web 为 `https://<主站域名>/development/`，API 为 `https://<主站域名>/api/development/v1/`。实际域名、TLS、凭据和上线窗口由部署负责人确认；不得把 demo 配置直接用于生产。

## 参与开发

1. 先阅读[总体技术设计](./docs/overall-technical-design.md)，确认任务属于平台核心还是领域模块。
2. 认领领域模块时同时明确长期负责人、数据归属、权限动作与作用域、接口和验收标准。
3. 复用 `packages/contracts` 中的公共契约以及现有模块结构；不要绕过统一身份、授权和审计能力。
4. 随功能补充自动化测试和维护文档，并在提交前执行 `npm run check`。
5. 通过本仓库的 Issue 或 Pull Request 讨论需求与提交实现；涉及公共契约或权限边界的改动应先由核心平台组评审。

## 相关项目

- [FreeBBS 主站](https://www.free-bbs.cn/)
- [FreeBBS 主站源码](https://github.com/Free-BBS/freebbs-web)

## 生产发布入口

生产安装、三个数据库账号、备份与恢复、commit 归档、冒烟和回滚统一按[生产发布与数据恢复检查清单](./docs/production-release-checklist.md)执行。操作者必须先确认 `FREEBBS_DOMAIN` 与 `RELEASE_SHA`，从当前 release 证据派生可选的 `PREVIOUS_RELEASE_SHA`；`FIRST_SUPER_ADMIN_UID` 只在首次初始化时使用。本地 demo 或 seed 命令不能作为生产步骤。
