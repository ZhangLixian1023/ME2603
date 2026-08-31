# 答答看 · 课堂 Quiz 网站

一个面向课堂使用的选择题测验网站。教师可以创建、发布和管理测验；学生无需注册账号，通过测验代码、学号和昵称参加答题。

当前版本采用 Docker Compose 部署，正式数据统一保存在 PostgreSQL 中，不再使用 SQLite。

## 系统结构

```text
学生/教师浏览器
       │
       ▼
Nginx 反向代理（对外端口）
       │
       ▼
Next.js 应用（不直接暴露）
       │
       ▼
PostgreSQL（Docker 内部网络）
```

Docker Compose 会启动三个服务：

- `nginx`：接收浏览器请求并转发给应用
- `app`：运行 Next.js 网站
- `postgres`：保存测验、题目、学生学号和成绩

PostgreSQL 数据保存在 Docker 命名卷 `postgres_data` 中。应用容器本身不保存业务数据。

当前没有图片、附件或视频上传功能，因此没有启动空闲的 MinIO 服务。以后增加文件上传时，应接入 MinIO 或兼容 S3 的对象存储，不应把上传文件保存在应用容器或普通文件服务器中。

## 当前功能

### 教师端

- 教师密码登录
- 创建、修改和删除选择题测验
- 保存草稿、发布测验、将测验下线
- 查看学生昵称、学号、正确题数和提交时间
- 查看公开排行榜
- 允许指定学生重新作答
- 下载 Excel 可直接打开的 UTF-8 CSV 成绩表

### 学生端

- 无需注册或设置密码
- 输入测验代码、学号和公开昵称进入
- 使用手机或电脑作答
- 每个学号对同一份测验只能提交一次
- 提交后查看总分及每题对错
- 不显示标准答案
- 排行榜只显示昵称，不显示学号

### 当前暂不支持

- 填空题和主观题
- 自动开放时间和截止时间
- 学生名单验证
- 学生账号和忘记密码
- 文件上传

## 不安装 Docker：本地预览

如果只是想查看和试用网站，不需要安装 Docker，也不需要安装 PostgreSQL。

先安装 Node.js 22.5 或更高版本，然后在项目目录运行：

```powershell
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
pnpm preview
```

浏览器打开：

- 学生端：<http://localhost:3100>
- 教师端：<http://localhost:3100/teacher>
- 教师密码：`teacher123`
- 示例测验代码：`DEMO26`

预览模式支持创建题目、发布/下线、学生提交、排行榜、重答和 CSV 下载。它使用进程内存，不使用 SQLite，也不会写入本地数据库文件。

预览模式的数据是临时的：按 `Ctrl + C` 停止服务或重启电脑后，新增测验和学生答卷会自动清空。正式使用必须采用后文的 Docker + PostgreSQL 部署方式。

## 最简单的 Docker 启动方法

### 1. 安装软件

请安装：

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git（只有上传或克隆 GitHub 时需要）

启动 Docker Desktop，等待它显示 Docker Engine 正常运行。

### 2. 创建配置文件

在项目目录打开 PowerShell：

```powershell
Copy-Item .env.example .env
```

用记事本或编辑器打开 `.env`，至少修改下面三项：

```text
POSTGRES_PASSWORD=数据库强密码
TEACHER_PASSWORD=教师端登录密码
SESSION_SECRET=至少32位的随机字符串
```

`POSTGRES_PASSWORD` 建议只使用大小写字母、数字、下划线和连字符。`.env` 已被 Git 忽略，不能上传到 GitHub。

### 3. 启动整个系统

```powershell
docker compose up -d --build
```

第一次启动需要下载镜像并构建应用，通常会比以后启动慢。

启动完成后打开：

- 学生首页：<http://localhost:3000>
- 教师后台：<http://localhost:3000/teacher>
- 健康检查：<http://localhost:3000/api/health>
- 示例测验代码：`DEMO26`

教师密码是 `.env` 中的 `TEACHER_PASSWORD`。

### 4. 查看运行状态

```powershell
docker compose ps
```

三个服务都显示正常或 `healthy` 即可。查看应用日志：

```powershell
docker compose logs -f app
```

按 `Ctrl + C` 只会退出日志查看，不会停止网站。

### 5. 停止或重新启动

停止网站但保留数据库：

```powershell
docker compose down
```

重新启动：

```powershell
docker compose up -d
```

更新代码后重新构建并启动：

```powershell
docker compose up -d --build
```

> 不要随意运行 `docker compose down -v`。其中的 `-v` 会删除 PostgreSQL 数据卷，测验和成绩将丢失。

## 从旧版 SQLite 切换

本版本不会再读取 `data/quiz.db`。首次启动 PostgreSQL 时会自动创建数据表，并生成示例测验 `DEMO26`。

旧版 SQLite 中的测试数据不会自动迁移。如果其中已经有必须保留的正式成绩，请先不要删除旧数据库，再单独编写一次性迁移脚本。

## PostgreSQL 配置

Docker Compose 使用下面这些环境变量：

| 变量 | 用途 |
| --- | --- |
| `POSTGRES_DB` | 数据库名称 |
| `POSTGRES_USER` | 数据库用户 |
| `POSTGRES_PASSWORD` | 数据库密码 |
| `DATABASE_POOL_MAX` | 应用连接池上限，默认 20 |
| `DATA_RETENTION_DAYS` | 答卷保留天数，默认 365 |
| `APP_PORT` | 网站对外端口，默认 3000 |

使用阿里云、腾讯云或其他托管 PostgreSQL 时，也可以直接配置：

```text
DATABASE_URL=postgresql://用户名:密码@数据库地址:5432/数据库名
```

托管数据库应开启自动备份。GitHub 和应用容器都不会替你备份数据库。

## 连接 PostgreSQL 的本地开发方式

如果需要直接修改代码、使用热更新，并把数据写入 PostgreSQL：

```powershell
docker compose up -d postgres
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
pnpm dev
```

此时 `.env` 中的 `PGHOST` 应为 `127.0.0.1`，而且 `PGPASSWORD` 必须和 `POSTGRES_PASSWORD` 相同。

## 常用检查命令

| 命令 | 用途 |
| --- | --- |
| `docker compose up -d --build` | 构建并启动整个系统 |
| `docker compose ps` | 查看容器状态 |
| `docker compose logs -f app` | 查看应用日志 |
| `docker compose down` | 停止服务但保留数据 |
| `pnpm preview` | 不依赖 Docker，在 3100 端口启动临时内存预览 |
| `pnpm lint` | 检查代码规范 |
| `pnpm build` | 检查正式构建 |
| `pnpm smoke` | 对运行在 3000 端口的网站进行基础功能测试 |

## 上传到 GitHub

1. 在 GitHub 创建一个空仓库，建议先选择 **Private**。
2. 不要让 GitHub 自动创建 README 或 `.gitignore`。
3. 在项目目录运行：

```powershell
git add .
git commit -m "Add PostgreSQL Docker Compose deployment"
git branch -M main
git remote add origin 你的GitHub仓库地址
git push -u origin main
```

后续更新：

```powershell
git add .
git commit -m "描述本次修改"
git push
```

以下内容不会上传：

- `.env` 和 `.env.local`
- PostgreSQL 数据卷
- 旧版 SQLite 数据
- `node_modules` 和 `.next`
- 临时文件、构建产物和本地备份

## 项目结构

```text
quiz-mvp/
├─ docker/
│  └─ nginx.conf          Nginx 反向代理配置
├─ public/                静态资源
├─ scripts/               基础功能测试脚本
├─ src/app/               页面和后端 API
├─ src/components/        教师端、学生端和排行榜组件
├─ src/lib/               PostgreSQL、登录和安全逻辑
├─ .dockerignore          Docker 构建排除规则
├─ .env.example           配置示例
├─ docker-compose.yml     整体部署脚本
├─ Dockerfile             Next.js 应用镜像
├─ package.json           项目命令和依赖
└─ README.md              本说明文件
```

## 上线前检查

1. 更换数据库密码、教师密码和 `SESSION_SECRET`。
2. 为正式域名配置 HTTPS。
3. 开启 PostgreSQL 每日自动备份。
4. 使用接近真实课堂人数的规模进行一次并发测试。
5. 限制服务器防火墙，只对公网开放 HTTP/HTTPS 和必要的 SSH 端口，不要开放 PostgreSQL 端口。

## 隐私提醒

系统会保存学生学号、昵称和答题成绩。公开排行榜只显示昵称，但教师端和 PostgreSQL 中仍保存学号。正式使用前，请根据学校要求确定数据保存期限、管理权限和隐私告知方式。
