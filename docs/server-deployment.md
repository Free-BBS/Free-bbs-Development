# 服务器部署与运维

本文描述 FreeBBS 发展端的生产部署基线。仓库提供 Docker、Nginx 和 systemd 配置；实际域名、
TLS 证书、服务器账号、仓库安装目录和凭据由部署负责人填写，本文不预设这些值。

## 生产拓扑与路径

生产环境采用同源路径：

```text
https://<主站域名>/development/          -> 发展端 Web 静态文件
https://<主站域名>/api/development/v1/  -> 发展端 API（Nginx 转发到 127.0.0.1:3100）
```

访问 `/development` 时，Nginx 应以 308 跳转到 `/development/`。浏览器不应直接访问 API
容器、MySQL 或 Adminer。主站和发展端同源时，`ALLOWED_ORIGINS` 保持为空。当前 API 只配置端口，
没有单独的监听地址变量；systemd 部署必须用主机防火墙/安全组阻止公网访问 3100，只允许本机 Nginx
连接。

## 发布前检查

在干净检出的待发布提交上执行：

```bash
npm ci
npm run check
docker compose config
docker compose build
```

只有上述命令通过且数据库备份完成后，才进入迁移和切换。保存待发布 commit SHA 与当前线上
commit SHA，后者是回滚目标。

## 生产环境文件

systemd 单元统一读取：

```text
/etc/freebbs-development/development.env
```

建议由 root 创建并限制读取权限：

```bash
sudo install -d -m 0750 -o root -g freebbs-development /etc/freebbs-development
sudo install -m 0640 -o root -g freebbs-development /dev/null \
  /etc/freebbs-development/development.env
sudoedit /etc/freebbs-development/development.env
```

生产文件至少应由部署负责人填写以下值：

```dotenv
NODE_ENV=production
PORT=3100
DATA_MODE=mysql
AUTH_MODE=main
MAIN_SITE_API_BASE_URL=https://<主站域名>
AUTH_TIMEOUT_MS=3000
ALLOWED_ORIGINS=
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=free_bbs_development
MYSQL_USER=freebbs_development
MYSQL_PASSWORD=<从密钥管理系统注入的强密码>
```

规则：

- 不得在生产设置 `AUTH_MODE=demo` 或 `VITE_AUTH_MODE=demo`；API 也会拒绝这种组合。
- `MAIN_SITE_API_BASE_URL` 是根地址，API 会追加 `/api/auth/me`。
- 不把 `.env`、Token、数据库密码、TLS 私钥提交到 Git 或输出到日志。
- 若 Web 在构建时读取 `VITE_AUTH_MODE`，应明确设为 `main` 或不设置；Vite 变量会进入客户端产物，
  所以其中绝不能放秘密。

## 数据库准备与迁移

生产 MySQL 应只监听回环或受限私网。运行时账号只授予 DML 权限，DDL 迁移使用独立临时账号；
完整 SQL 和迁移、备份、恢复步骤见 [数据管理](./data-administration.md)。

推荐发布顺序：

1. 验证最近一次备份可读取，并记录备份文件校验和。
2. 使用迁移账号执行 `npm run db:migrate`。
3. 不在生产执行 `npm run db:seed`；当前 seed 是固定演示数据。
4. 启动新 API，先从服务器本机检查健康接口。
5. 切换 Web 静态文件或容器，再做同源路径冒烟测试。

迁移记录存放在 `schema_migrations`。已应用迁移的校验和发生变化时，脚本会失败；不要修改已发布的
`database/migrations/*.sql`，应新增下一编号迁移。

## systemd 与主站 Nginx 部署

仓库提供两个 systemd 单元：

- `deploy/systemd/freebbs-development-api.service`：持续运行 API；
- `deploy/systemd/freebbs-development-web.service`：一次性验证静态入口和系统 Nginx 配置，不启动第二个
  Nginx 进程。

API 单元固定使用用户/组 `freebbs-development`、工作目录 `/opt/freebbs-development/current` 和
`/usr/bin/node`。先构建 `apps/api/dist`、`packages/contracts/dist`、`apps/web/dist`，再把经过验证的发布
目录原子切换为 `/opt/freebbs-development/current`。Web 产物应安装到
`/usr/share/nginx/html/development`。不要让服务账号拥有 Git 凭据或环境文件写权限。

### Nginx 接入边界

两个 Nginx 文件用途不同，不得混用：

- `deploy/nginx/freebbs-development.conf` 是 Docker Web 镜像使用的完整 `server { listen 8080; }` 配置；
- `deploy/nginx/freebbs-development.locations.conf` 只包含宿主机路由，应通过 `include` 嵌入主站现有的
  HTTPS `server` 块。

宿主机路由片段负责 `/development` 的 308 跳转、`/development/` 静态 SPA fallback，以及
`/api/development/v1/` 到 `127.0.0.1:3100` 的代理。它转发 Authorization header，以便 API 向主站核验
登录身份。片段不包含生产域名和 TLS 配置。

先安装静态产物和片段：

```bash
sudo install -d -m 0755 /usr/share/nginx/html/development
sudo rsync -a --delete apps/web/dist/ /usr/share/nginx/html/development/
sudo install -d -m 0755 /etc/nginx/snippets
sudo install -m 0644 deploy/nginx/freebbs-development.locations.conf \
  /etc/nginx/snippets/freebbs-development.locations.conf
```

在主站对应的 HTTPS `server` 块中加入且只加入一次：

```nginx
include /etc/nginx/snippets/freebbs-development.locations.conf;
```

然后校验并平滑加载现有主站 Nginx。这里不启动额外 Nginx 实例：

```bash
sudo nginx -t
sudo systemctl reload nginx.service
```

### 安装 systemd 单元

先核对单元中的路径、用户和组是否与服务器一致。若不一致，应在受评审的部署包中调整配置。确认主站
Nginx 已加载上述片段后安装：

```bash
sudo install -m 0644 deploy/systemd/freebbs-development-api.service \
  /etc/systemd/system/freebbs-development-api.service
sudo install -m 0644 deploy/systemd/freebbs-development-web.service \
  /etc/systemd/system/freebbs-development-web.service
sudo systemctl daemon-reload
sudo systemctl enable --now freebbs-development-api.service
sudo systemctl enable --now nginx.service
sudo systemctl enable --now freebbs-development-web.service
```

Web 单元为 `Type=oneshot`：它只检查 `/usr/share/nginx/html/development/index.html` 与已安装的宿主机
路由片段可读，随后保持 `active (exited)`。`nginx -t` 只在上面的 reload 前由部署者执行，避免 hardened
oneshot 重复打开 Nginx 日志或运行文件。实际请求始终由系统 `nginx.service` 承载，因此不会与主站争用
PID、端口或全局配置。
检查状态和本机健康：

```bash
sudo systemctl status freebbs-development-api.service --no-pager
sudo systemctl status nginx.service --no-pager
sudo systemctl status freebbs-development-web.service --no-pager
curl --fail --silent --show-error \
  http://127.0.0.1:3100/api/development/v1/health
```

两个 FreeBBS 单元都启用了 `NoNewPrivileges`、`PrivateTmp`、`ProtectSystem=strict` 和 `ProtectHome`。若单元
因权限失败，应修正明确的静态目录或服务目录权限，不要整体关闭沙箱保护。

查看日志：

```bash
sudo journalctl -u freebbs-development-api.service -n 200 --no-pager
sudo journalctl -u freebbs-development-web.service -n 100 --no-pager
sudo journalctl -u nginx.service -n 100 --no-pager
sudo journalctl -u freebbs-development-api.service -f
```

日志中不得出现 Authorization header、Bearer Token 或数据库密码。API 响应的 `X-Request-Id` 可用于
关联请求；记录排障信息时优先记录它。

同源冒烟测试（替换占位域名）：

```bash
curl --fail --silent --show-error --head \
  https://<主站域名>/development
curl --fail --silent --show-error \
  https://<主站域名>/api/development/v1/health
```

首个请求应返回 308 且 `Location` 为 `/development/`；健康响应只应包含状态、版本和数据库模式。

## Docker Compose 部署

`docker-compose.yml` 是仓库支持的容器化集成入口。默认栈可用于不带持久化的 demo/memory 核对；
MySQL 通过 `mysql` profile 启用，演示数据通过 `seed` profile 显式写入，Adminer 通过 `adminer`
profile 显式启用。主机只在 `127.0.0.1:${WEB_PORT:-8080}` 暴露 Web/API 入口，数据库只有容器网络内的
`expose: 3306`。`seed` profile 固定为 development 且只能用于本地/集成环境。

当前 Compose 的 `api`、`migrate` 和 `seed` 服务共用一组 `MYSQL_USER`/`MYSQL_PASSWORD`，适合本地 MySQL
集成，但不满足上文“运行时 DML 账号与迁移 DDL 账号分离”的生产基线。在部署配置支持两组独立
凭据并经过测试前，生产应采用 systemd/受控迁移流程；不要把本地 Compose 配置原样发布到公网。

执行集成检查时必须显式注入变量，并确保 `DATA_MODE=mysql`。先检查解析后的配置中没有意外的演示
认证或明文秘密：

```bash
docker compose --profile mysql config
docker compose --profile mysql up --build -d
docker compose --profile mysql ps
```

数据库不映射宿主机公网端口。Adminer 默认不启动；确需临时排障时，它只能绑定
`127.0.0.1:${ADMINER_PORT:-8081}`，并应配合 SSH 隧道，使用后立即停止。常规业务管理应使用
`/development/admin` 页面，而不是 Adminer。

## 健康检查与发布验收

至少核对：

1. `GET /api/development/v1/health` 返回 HTTP 200、`data.status=ok`、`data.databaseMode=mysql`。
2. `/development/` 的 HTML、JS、CSS 均在该子路径下成功加载。
3. 已登录主站用户可打开发展端；无效或缺失 Token 得到预期的 401 登录提示。
4. 普通同学无法打开最高权限管理操作；管理员可读取模块状态和审计日志。
5. 日志无凭据、堆栈泄露、持续 5xx 或主站身份接口超时。

## 回滚

应用回滚不能自动撤销已经执行的数据库迁移。发布前必须判断新旧代码是否都兼容迁移后的结构。

安全回滚流程：

1. 暂停写入或进入维护窗口，保存当前日志和请求 ID。
2. 将应用切回已记录的上一稳定 commit/image，不运行旧 seed。
3. 重启 API 和 Web，重新执行健康与权限冒烟测试。
4. 只有在新迁移不可向后兼容且业务确认允许丢弃迁移后写入时，才从发布前备份恢复数据库。
5. 数据库恢复应先进入隔离实例验证，再按 [数据管理](./data-administration.md) 执行。

systemd 重启命令：

```bash
sudo systemctl restart freebbs-development-api.service
sudo nginx -t
sudo systemctl reload nginx.service
sudo systemctl restart freebbs-development-web.service
```

Compose 回滚应使用明确的上一 image tag 或上一提交重新构建；不要用无版本的 `latest` 作为唯一回滚
依据。

## 故障定位

### 502 Bad Gateway

先检查 API systemd/容器状态，再从服务器本机访问端口 3100。若本机健康、域名 502，检查 Nginx
upstream 和防火墙；端口 3100 不得从公网到达。

### 401 或 503

401 通常表示没有 Token 或主站判定身份无效；503 表示主站身份服务不可用、超时或响应无效。检查
`MAIN_SITE_API_BASE_URL`、服务器到主站的 DNS/TLS/网络和 `AUTH_TIMEOUT_MS`，不要打印 Token。

### 页面刷新后 404

确认 `/development/` location 使用 SPA fallback 到 `/development/index.html`，且构建产物的 Vite base
仍是 `/development/`。

### API 健康但业务请求 500

用响应 `X-Request-Id` 关联 journal/container 日志，检查迁移状态和数据库连接。不要把数据库凭据或
原始用户数据粘贴到公开问题单。
