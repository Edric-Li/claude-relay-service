# Docker 自动构建和推送指南

本项目已配置完整的自动化Docker构建和推送流程，支持推送到 **Docker Hub** 和 **GitHub Container Registry (GHCR)**。

---

## 📋 目录

- [快速开始](#快速开始)
- [配置GitHub Secrets](#配置github-secrets)
- [自动化流程说明](#自动化流程说明)
- [手动构建推送](#手动构建推送)
- [版本管理](#版本管理)
- [故障排查](#故障排查)

---

## 🚀 快速开始

### 自动化流程（推荐）

**只需3步，即可实现自动构建和推送**：

1. **配置GitHub Secrets**（一次性操作）
   - 在仓库设置中添加 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN`

2. **提交代码到main分支**
   ```bash
   git checkout main
   git merge edric  # 或者直接在main分支提交
   git push origin main
   ```

3. **自动完成**
   - ✅ 自动版本号递增（1.1.192 → 1.1.193）
   - ✅ 构建多平台镜像（amd64/arm64）
   - ✅ 推送到Docker Hub和GHCR
   - ✅ 创建GitHub Release
   - ✅ 生成changelog
   - ✅ 发送Telegram通知（可选）

---

## 🔑 配置GitHub Secrets

### 1. 获取 Docker Hub Token

访问 [Docker Hub](https://hub.docker.com/) → Account Settings → Security → New Access Token

1. **Token Description**: `GitHub Actions - Claude Relay Service`
2. **Access permissions**: 选择 `Read, Write, Delete`（推荐）或 `Read & Write`
3. 点击 **Generate** 并复制生成的token（只显示一次，请妥善保存）

### 2. 配置 GitHub Secrets

前往你的GitHub仓库：

```
Settings → Secrets and variables → Actions → New repository secret
```

添加以下Secrets：

| Secret名称 | 值 | 说明 |
|-----------|-----|------|
| `DOCKERHUB_USERNAME` | 你的Docker Hub用户名 | 例如：`edricli` 或 `weishaw` |
| `DOCKERHUB_TOKEN` | 刚才生成的token | 以 `dckr_pat_` 开头的字符串 |

**可选Secrets**（用于Telegram通知）：

| Secret名称 | 值 | 说明 |
|-----------|-----|------|
| `TELEGRAM_BOT_TOKEN` | 机器人token | 从 @BotFather 获取 |
| `TELEGRAM_CHAT_ID` | 聊天ID | 你的Telegram用户ID或群组ID |

---

## 🔄 自动化流程说明

### 触发条件

当代码推送到 `main` 分支时自动触发，**但会智能跳过以下情况**：

- 只修改了文档文件（`.md`, `docs/`）
- 只修改了配置文件（`.github/`, `.gitignore`, `LICENSE`）
- 只修改了 `VERSION` 文件
- 提交信息包含 `[skip ci]`

### 执行步骤

```
1. 检测代码变更 → 判断是否需要发布
   ↓
2. 版本号管理 → 自动递增patch版本 (1.1.192 → 1.1.193)
   ↓
3. 前端构建 → 构建Vue.js前端并推送到web-dist分支
   ↓
4. 生成Changelog → 使用git-cliff生成更新日志
   ↓
5. 创建Git Tag → 创建版本tag (v1.1.193)
   ↓
6. Docker构建 → 多平台构建 (linux/amd64, linux/arm64)
   ↓
7. 推送镜像 → 推送到Docker Hub和GHCR
   ↓
8. 创建Release → 在GitHub创建Release
   ↓
9. 发送通知 → Telegram通知（如果配置）
```

### 生成的Docker镜像标签

每次发布会创建以下标签：

**Docker Hub**:
```
weishaw/claude-relay-service:v1.1.193
weishaw/claude-relay-service:1.1.193
weishaw/claude-relay-service:latest
```

**GitHub Container Registry**:
```
ghcr.io/edric-li/claude-relay-service:v1.1.193
ghcr.io/edric-li/claude-relay-service:1.1.193
ghcr.io/edric-li/claude-relay-service:latest
```

---

## 🛠️ 手动构建推送

如果需要手动构建和推送（用于测试或特殊发布）：

### 本地构建测试

```bash
# 构建本地镜像（仅amd64平台）
docker build -t claude-relay-service:test .

# 运行测试
docker run -d -p 3000:3000 \
  -e REDIS_HOST=host.docker.internal \
  -e JWT_SECRET=your-secret \
  claude-relay-service:test
```

### 手动推送到Docker Hub

```bash
# 1. 登录Docker Hub
docker login -u your-username

# 2. 构建多平台镜像
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -t your-username/claude-relay-service:v1.2.0 \
  -t your-username/claude-relay-service:latest \
  --push .

# 3. 验证推送
docker pull your-username/claude-relay-service:latest
```

### 手动推送到GHCR

```bash
# 1. 登录GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u your-username --password-stdin

# 2. 构建并推送
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/your-username/claude-relay-service:v1.2.0 \
  -t ghcr.io/your-username/claude-relay-service:latest \
  --push .
```

---

## 📊 版本管理

### 版本号格式

采用 [Semantic Versioning](https://semver.org/) 格式：`MAJOR.MINOR.PATCH`

- **MAJOR**: 重大不兼容更新（手动修改）
- **MINOR**: 新功能添加（手动修改）
- **PATCH**: Bug修复和小改进（自动递增）

### 当前版本

```bash
# 查看当前版本
cat VERSION
# 输出: 1.1.192
```

### 手动修改版本

如果需要手动调整版本号（如升级到2.0.0）：

```bash
# 1. 修改VERSION文件
echo "2.0.0" > VERSION

# 2. 提交并推送到main分支
git add VERSION
git commit -m "chore: bump version to 2.0.0"
git push origin main

# 3. 自动化流程会基于这个版本继续递增
```

---

## 🔍 故障排查

### 问题1: GitHub Actions失败 - Docker登录失败

**错误信息**:
```
Error: Cannot perform an interactive login from a non TTY device
```

**解决方案**:
1. 检查GitHub Secrets是否正确配置：
   - `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN` 都存在
   - Token没有过期
2. 重新生成Docker Hub Token（确保权限为 Read & Write）

### 问题2: 镜像推送成功但拉取失败

**错误信息**:
```
Error response from daemon: manifest unknown
```

**解决方案**:
1. 等待几分钟（镜像推送需要时间同步）
2. 检查镜像名称是否正确（注意用户名大小写）
3. 验证镜像是否真的推送成功：
   ```bash
   # 访问Docker Hub查看
   # https://hub.docker.com/r/your-username/claude-relay-service/tags
   ```

### 问题3: 版本号没有自动递增

**原因**:
- 只修改了文档或配置文件
- 提交信息包含 `[skip ci]`

**解决方案**:
检查 `.github/workflows/auto-release-pipeline.yml` 中的 `Check if version bump is needed` 步骤日志。

### 问题4: 多平台构建失败

**错误信息**:
```
ERROR: failed to solve: process "/bin/sh -c npm ci" did not complete successfully
```

**解决方案**:
1. 检查 Dockerfile 中的依赖是否支持 arm64
2. 如果只需要 amd64，修改 workflow 中的 `platforms` 参数：
   ```yaml
   platforms: linux/amd64  # 移除 linux/arm64
   ```

### 问题5: 前端构建失败

**错误信息**:
```
npm ERR! code ELIFECYCLE
```

**解决方案**:
1. 检查 `web/admin-spa/package.json` 依赖是否正确
2. 本地测试前端构建：
   ```bash
   cd web/admin-spa
   npm ci
   npm run build
   ```

---

## 📚 相关文档

- [Dockerfile](../Dockerfile) - Docker镜像构建配置
- [docker-compose.yml](../docker-compose.yml) - Docker Compose配置
- [GitHub Actions配置](.github/workflows/auto-release-pipeline.yml) - 自动化流程
- [项目文档](../CLAUDE.md) - 项目架构说明

---

## 🎯 最佳实践

### 开发流程

```bash
# 1. 在开发分支工作
git checkout -b feature/new-feature
# ... 开发和测试 ...
git commit -m "feat: add new feature"

# 2. 推送到GitHub并创建PR
git push origin feature/new-feature
# 在GitHub上创建Pull Request

# 3. 合并到main分支
# PR合并后自动触发构建和发布

# 4. 验证发布
# 检查 GitHub Actions、Docker Hub、GitHub Releases
```

### 版本发布建议

- **小改进/Bug修复**: 让自动化流程处理（自动递增patch）
- **新功能**: 手动修改VERSION为x.y.0，推送到main
- **重大更新**: 手动修改VERSION为x.0.0，推送到main

### Docker镜像使用

```bash
# 生产环境：使用版本号标签（稳定）
docker pull weishaw/claude-relay-service:v1.1.192

# 测试环境：使用latest标签（最新）
docker pull weishaw/claude-relay-service:latest

# 使用GHCR（GitHub在中国可能更快）
docker pull ghcr.io/edric-li/claude-relay-service:latest
```

---

## 💡 提示

- 自动化流程会保留最近50个版本的tags和releases
- 每次发布都会生成详细的changelog
- Docker镜像支持多平台（amd64/arm64），适用于各种服务器
- GHCR镜像在中国访问可能比Docker Hub更快

---

**状态**: ✅ Production Ready

**最后更新**: 2025-11-08
