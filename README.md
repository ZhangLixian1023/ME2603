# 答答看 · 课堂 Quiz 网站

一个面向课堂使用的选择题测验网站。教师可以创建、发布和管理测验；学生无需注册账号，通过测验代码、学号和姓名参加答题。

正式数据保存在 PostgreSQL 中，部署在一台不带 Docker 的 Linux 服务器上。开发者 `git push` 到 `main` 分支后，GitHub 通过 webhook 通知服务器自动重新部署，不需要登录服务器手动操作。

## 实际部署情况

生产环境是一台阿里云 ECS（HKaliyun），所有组件都直接装在系统里，没有 Docker。Nginx 在 80/443 上做 HTTPS 反代：

```text
浏览器  ──HTTPS──▶  :443  (nginx)
                       ├─▶  :3100  (Next.js / pnpm start, 由 pm2 守护, 仅 127.0.0.1)
                       │       │
                       │       └─▶  :5432  (PostgreSQL, 仅 127.0.0.1)
                       └─▶  :3101  (webhook 接收服务, 仅 127.0.0.1)
HTTP   ──▶  :80  ──301──▶ https://trainnn.work
GitHub push ──POST──HTTPS──▶  :443/webhook  (IP 白名单)
```

- **Nginx**：监听 `0.0.0.0:80`（强制跳转 HTTPS）和 `0.0.0.0:443`（TLS 终结 + 反代）。配置：`/etc/nginx/sites-available/trainnn.work`，源码在仓库 `deploy/trainnn.work.nginx`。
- **Next.js 应用**：监听 `0.0.0.0:3100`（仅本机，ufw 已关闭公网入口），通过 `pm2` 拉起并随开机自启
- **PostgreSQL**：监听 `127.0.0.1:5432`，由 `quiz` 用户管理 `quiz` 数据库
- **Webhook 接收服务**：`/opt/me2603-webhook/server.mjs`，监听 `:3101`（仅本机，ufw 已关闭公网入口），只接受来自 GitHub `hooks` IP 段的 POST
- **SSH 入口**：`/var/www/ME2603/` 是部署目录，`.env` 在该目录下
- **每日定时任务**：`systemd` timer 每天凌晨刷新 GitHub IP 白名单

部署流程（详见后文）：

```text
开发者 git push origin main
  → GitHub POST 到 HKaliyun:3101/webhook
  → 服务端校验 IP 白名单 + ref 是 refs/heads/main + 没在 24h 内重投递
  → 执行 /var/www/ME2603/scripts/deploy.sh
  → flock 互斥 → git fetch → 比对 HEAD 与 origin/main
  → 若有新文件改动：git pull → pnpm install → pnpm build → pm2 重启
  → 若只是空 commit / 无文件变化：跳过重启
```

## 当前功能

### 教师端

- 中文 / English 界面切换，默认 English（题目内容保持教师原文）
- 教师密码登录
- 创建、修改和删除选择题测验
- 保存草稿、发布测验、将测验下线
- 查看学生姓名、学号、正确题数和提交时间
- 查看公开排行榜
- 允许指定学生重新作答
- 下载 Excel 可直接打开的 UTF-8 CSV 成绩表

### 学生端

- 中文 / English 界面切换，默认 English（题目内容保持教师原文）
- 无需注册或设置密码
- 输入测验代码、学号和姓名进入
- 使用手机或电脑作答
- 每个学号对同一份测验只能提交一次
- 提交后查看总分及每题对错
- 不显示标准答案
- 排行榜公开显示姓名，不显示学号

### 当前暂不支持

- 填空题和主观题
- 自动开放时间和截止时间
- 学生名单验证
- 学生账号和忘记密码
- 文件上传

## 服务器部署（不依赖 Docker）

下面描述的是这台 HKaliyun 实际发生过的事情。同样的步骤可以在任何 Ubuntu 24.04 + Node.js 22 的 Linux 服务器上复刻。

### 1. 一次性安装基础软件

```bash
# Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser quiz --pwprompt
sudo -u postgres createdb quiz -O quiz

# pnpm（用系统自带版本即可，避免 corepack 的签名验证问题）
sudo npm install -g pnpm@11.19.0

# pm2
sudo npm install -g pm2
pm2 startup systemd   # 跟着输出提示执行 sudo 命令
```

### 2. 部署代码与配置

```bash
sudo mkdir -p /var/www/ME2603
sudo chown $USER:$USER /var/www/ME2603
git clone https://github.com/ZhangLixian1023/ME2603.git /var/www/ME2603
cd /var/www/ME2603

cp .env.example .env
nano .env   # 至少修改 TEACHER_PASSWORD / DATABASE_URL / COOKS_SECURE
```

`.env` 中关键的几项：

```text
TEACHER_PASSWORD=教师端登录密码
DATABASE_URL=postgresql://quiz:你的密码@127.0.0.1:5432/quiz
DATABASE_POOL_MAX=20
PORT=3100
HOSTNAME=0.0.0.0
COOKIE_SECURE=true   # 走 HTTPS，必须 true，否则浏览器拒收 cookie
```

### 3. 启动 Next.js 应用

```bash
cd /var/www/ME2603
pnpm install --frozen-lockfile
pnpm build
pm2 start "pnpm start" --name me2603
pm2 save   # 把当前进程列表写入开机自启
```

之后所有重启 / 构建都在 webhook 触发的部署脚本里完成，不需要再手动跑这三行。

### 4. 配置 GitHub Webhook self-host

服务器本身有一个 webhook 接收进程在 :3101 监听，只接受 GitHub 的 POST。

**服务器端**（HKaliyun 上已经做好的步骤，正常运维不需要重做）：

```bash
sudo mkdir -p /opt/me2603-webhook /etc/me2603-webhook /var/log/me2603-webhook

# 复制三个文件到 /opt/me2603-webhook/：
#   server.mjs          webhook 接收服务
#   refresh-ips.mjs     每天凌晨拉 GitHub IP 白名单
#   package.json        "type":"module"，无运行时依赖

# 安装 systemd 每天刷 IP 的 timer
sudo cp deploy/me2603-webhook-refresh.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now me2603-webhook-refresh.timer

# 启动 webhook 服务
pm2 start /opt/me2603-webhook/server.mjs --name me2603-webhook
pm2 save
```

源码都在仓库的 `deploy/` 目录，每次更新代码时 `git pull` 会自动拉取最新版本（部署脚本会同步重启 `me2603-webhook` 进程）。

**GitHub 端**：

仓库 → Settings → Webhooks → Add webhook：

| 字段 | 值 |
| --- | --- |
| Payload URL | `https://trainnn.work/webhook` |
| Content type | `application/json` |
| Secret | 见下文「Webhook secret」一节 |
| SSL verification | ☑ Enable |
| Which events | ☑ Just the push event |

保存后 GitHub 会立刻发 `ping`，在 webhook 详情的 Recent deliveries 看到 `200` 即通。

### Webhook secret

服务端用 HMAC-SHA256 校验 `X-Hub-Signature-256`。两边必须用同一个 secret：

```bash
# 生成
SECRET=$(openssl rand -hex 32)
echo "$SECRET"

# 写入 .env
echo "WEBHOOK_SECRET=$SECRET" >> /var/www/ME2603/.env
pm2 restart me2603-webhook
```

GitHub 端：仓库 → Settings → Webhooks → 编辑 webhook，把同样的 secret 粘进 Secret 输入框，保存。`server.mjs` 启动日志会打印 `WEBHOOK_SECRET loaded (64 chars)`，未配置时会拒绝所有请求并提示 `WEBHOOK_SECRET not configured`。

### 5. HTTPS（Nginx + Let's Encrypt）

```bash
# 安装 nginx
sudo apt install -y nginx

# 申请证书（首次）
sudo apt install -y certbot
sudo certbot --nginx -d trainnn.work

# 把仓库里的配置拷过去
sudo cp deploy/trainnn.work.nginx /etc/nginx/sites-available/trainnn.work
sudo ln -sf /etc/nginx/sites-available/trainnn.work /etc/nginx/sites-enabled/trainnn.work
sudo nginx -t && sudo systemctl reload nginx

# 证书自动续期：certbot 装的 systemd timer 已经搞定，不用额外配
```

`server.mjs` 只信任 `X-Real-IP`，且仅在 TCP 对端为 `127.0.0.1` 时信任，外部伪造 header 无效。

### 6. 防火墙 (ufw)

```bash
sudo ufw allow 22/tcp    comment "ssh"
sudo ufw allow 80/tcp    comment "http -> https"
sudo ufw allow 443/tcp   comment "https"
```

`3100`（Next.js）和 `3101`（webhook）只对 `127.0.0.1` 监听，不在 ufw 里开放。**不要把 5432 暴露到公网**——PostgreSQL 只对 127.0.0.1 监听。

### 6. 部署脚本做了什么

`/var/www/ME2603/scripts/deploy.sh` 由 webhook 服务调用，逻辑：

```bash
flock -n /var/lock/me2603-deploy.lock    # 互斥，避免并发跑两次
cd /var/www/ME2603
git fetch origin main
[ HEAD = origin/main ] && exit 0          # 没新东西，跳过
git pull --ff-only
git diff --quiet HEAD@{1} HEAD && exit 0  # 只是空 commit，跳过
pnpm install --frozen-lockfile
pnpm build
pm2 delete me2603 2>/dev/null || true
. ./.env && pm2 start "pnpm start" --name me2603
```

## 服务器日常运维

```bash
# 应用状态
ssh HKaliyun 'pm2 list'
ssh HKaliyun 'pm2 show me2603'

# 看日志
ssh HKaliyun 'pm2 logs me2603 --lines 50'
ssh HKaliyun 'pm2 logs me2603-webhook --lines 50'

# 重启
ssh HKaliyun 'pm2 restart me2603'
ssh HKaliyun 'pm2 restart me2603-webhook'

# 手动触发一次部署（当本地 = origin/main 时会跳过）
ssh HKaliyun '/var/www/ME2603/scripts/deploy.sh'

# webhook 触发审计日志（JSON lines，每行一条）
ssh HKaliyun 'tail -20 /var/log/me2603-webhook/audit.log'

# webhook 实时部署输出
ssh HKaliyun 'tail -f /root/.pm2/logs/me2603-webhook-out.log'

# 手动刷新 GitHub IP 白名单（正常情况每天 systemd timer 自动跑）
ssh HKaliyun 'sudo systemctl start me2603-webhook-refresh.service'

# 直接登录 PostgreSQL
ssh HKaliyun 'psql -U quiz -d quiz -h 127.0.0.1'
```

## 本地预览（不依赖 Docker、不依赖 PostgreSQL）

只想本地看效果、做界面调试：

```bash
git clone https://github.com/ZhangLixian1023/ME2603
cd ME2603
pnpm install
pnpm preview
```

浏览器打开：

- 学生端：<http://localhost:3100>
- 教师端：<http://localhost:3100/teacher>
- 教师密码：`teacher123`（写在 `.env.example` 里）
- 示例测验代码：`DEMO26`

预览模式用进程内存存数据，`Ctrl + C` 后会丢失。**正式数据一定走 PostgreSQL**。

## 本地开发（连接 PostgreSQL）

需要真正改代码、改数据库时：

```bash
# 在自己机器上装 PostgreSQL（不是 Docker），创建 quiz/quiz 用户和数据库
# 或在 .env 里把 DATABASE_URL 指向远程开发库

cp .env.example .env
# 编辑 .env，把 DATABASE_URL 指向自己的库

pnpm install
pnpm dev   # next dev，热更新
```

`.env` 中 `PGHOST` 应为 `127.0.0.1`，`PGPASSWORD` 与 `POSTGRES_PASSWORD` 一致。

## 从旧版 SQLite 切换

本版本不会再读取 `data/quiz.db`。首次启动 PostgreSQL 时会自动创建数据表，并生成示例测验 `DEMO26`。

旧版 SQLite 中的测试数据不会自动迁移。如果其中已经有必须保留的正式成绩，请先不要删除旧数据库，再单独编写一次性迁移脚本。

## PostgreSQL 配置

直接安装在系统上的 PostgreSQL，通过 `.env` 配置：

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | `postgresql://用户:密码@地址:5432/数据库` |
| `DATABASE_POOL_MAX` | 应用连接池上限，默认 20 |
| `DATA_RETENTION_DAYS` | 答卷保留天数，默认 365 |

托管数据库（阿里云 RDS、腾讯云 CDB 等）也可以直接配置 `DATABASE_URL` 远程使用：

```text
DATABASE_URL=postgresql://用户名:密码@数据库地址:5432/数据库名
```

托管数据库应开启自动备份。GitHub 和应用都不会替你备份数据库。

## 常用检查命令

| 命令 | 用途 |
| --- | --- |
| `ssh HKaliyun 'pm2 list'` | 查看两个守护进程状态 |
| `ssh HKaliyun 'pm2 logs me2603'` | 跟踪应用日志 |
| `ssh HKaliyun 'pm2 restart me2603'` | 重启 Next.js 应用 |
| `ssh HKaliyun 'pm2 logs me2603-webhook'` | webhook 接收服务日志 |
| `ssh HKaliyun 'tail -20 /var/log/me2603-webhook/audit.log'` | webhook 触发历史 |
| `pnpm preview` | 不依赖数据库，3100 启动内存预览 |
| `pnpm dev` | 热更新开发模式 |
| `pnpm lint` | 检查代码规范 |
| `pnpm build` | 检查正式构建 |
| `pnpm smoke` | 对运行中的网站进行端到端 API 测试 |

## 上传到 GitHub

仓库已在 <https://github.com/ZhangLixian1023/ME2603>。

更新流程：本地改完 `git push`，GitHub 通知 webhook，服务器自动拉代码 + 部署。

以下内容不会上传（已被 `.gitignore` 排除）：

- `.env` 和 `.env.local`
- PostgreSQL 数据卷（数据库是单独的，跟代码无关）
- 旧版 SQLite 数据
- `node_modules` 和 `.next`
- 临时文件、构建产物和本地备份

## 项目结构

```text
ME2603/
├─ deploy/                     服务器运维脚本（不是 Next.js 的一部分）
│  ├─ server.mjs                  webhook 接收服务
│  ├─ refresh-ips.mjs             每天刷 GitHub IP 白名单
│  ├─ deploy.sh                   webhook 触发的部署脚本
│  ├─ me2603-webhook-refresh.service
│  ├─ me2603-webhook-refresh.timer
│  └─ webhook-package.json
├─ public/                     静态资源
├─ scripts/                    基础功能测试脚本
│  ├─ preview.mjs                 内存模式预览
│  └─ smoke.mjs                    API 端到端测试
├─ src/app/                    页面和后端 API
├─ src/components/             教师端、学生端和排行榜组件
├─ src/lib/                    PostgreSQL、登录和安全逻辑
├─ .env.example                配置示例
├─ next.config.ts
├─ package.json                项目命令和依赖
└─ README.md                   本说明文件
```

老的 `Dockerfile`、`docker-compose.yml`、`docker/` 目录仍保留在仓库里——是从上游 fork 来的，未删除仅为保留参考。**当前生产环境并不使用 Docker**。

## 上线前检查

1. 更换数据库密码、教师密码。
2. ufw 已经把 5432 留作 127.0.0.1，公网只开 22/80/443。
3. `.env` 中的 `COOKIE_SECURE=true` 与 HTTPS 一致。
4. GitHub webhook Payload URL 改为 `https://trainnn.work/webhook`，Recent deliveries 中 `ping` 返回 200。
5. 推一次真实改动，确认 webhook → 部署 → 应用健康（`curl https://trainnn.work/api/health` 返回 `{"status":"ok"}`）。
6. `pm2 save` 已经执行，重启服务器后两个进程都会自启。
7. Let's Encrypt 证书由 `certbot.timer` 自动续期。

## 隐私提醒

系统会保存学生学号、姓名和答题成绩。公开排行榜显示姓名，但学号只在教师端和 PostgreSQL 中保存。正式使用前，请根据学校要求确定数据保存期限、管理权限和隐私告知方式。