# Claude Relay Service

多平台 AI API 中转服务，支持 Claude、Gemini、OpenAI Responses (Codex)、AWS Bedrock、Azure OpenAI 等。

## 功能特性

- **多账户管理**: 支持多个 AI 账户自动轮换和负载均衡
- **统一 API Key**: 为每个用户分配独立的 API Key
- **使用统计**: 详细记录 Token 使用量和成本
- **智能调度**: 账户故障自动切换，粘性会话支持
- **Web 管理界面**: 实时监控、账户管理、使用分析
- **安全控制**: 速率限制、并发控制、客户端限制、模型黑名单

## 快速开始

### 环境要求

- Node.js 18+
- Redis 6+

### 安装

```bash
git clone https://github.com/your-repo/claude-relay-service.git
cd claude-relay-service

npm install
cp config/config.example.js config/config.js
cp .env.example .env

# 编辑 .env 配置必要的环境变量
# JWT_SECRET=你的JWT密钥
# ENCRYPTION_KEY=32位加密密钥

npm run setup
npm run install:web
npm run build:web
npm run service:start:daemon
```

### Docker 部署

```bash
docker-compose up -d
```

## 配置

### 必填环境变量

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 密钥（32字符以上） |
| `ENCRYPTION_KEY` | 数据加密密钥（32字符） |
| `REDIS_HOST` | Redis 主机地址 |
| `REDIS_PORT` | Redis 端口 |

### 可选环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `USER_MANAGEMENT_ENABLED` | 启用用户管理 | false |
| `LDAP_ENABLED` | 启用 LDAP 认证 | false |
| `WEBHOOK_ENABLED` | 启用 Webhook 通知 | true |
| `STICKY_SESSION_TTL_HOURS` | 粘性会话 TTL | 1 |

## 使用方法

### 管理界面

访问 `http://服务器地址:3000/admin-next/` 进行管理。

管理员凭据保存在 `data/init.json`。

### Claude Code 配置

```bash
export ANTHROPIC_BASE_URL="http://服务器地址:3000/api/"
export ANTHROPIC_AUTH_TOKEN="你的API密钥"
```

### Gemini CLI 配置

```bash
export CODE_ASSIST_ENDPOINT="http://服务器地址:3000/gemini"
export GOOGLE_CLOUD_ACCESS_TOKEN="你的API密钥"
export GOOGLE_GENAI_USE_GCA="true"
```

### Codex CLI 配置

在 `~/.codex/config.toml` 中添加：

```toml
model_provider = "crs"

[model_providers.crs]
name = "crs"
base_url = "http://服务器地址:3000/openai"
wire_api = "responses"
requires_openai_auth = true
env_key = "CRS_OAI_KEY"
```

## API 端点

| 路由 | 说明 |
|------|------|
| `/api/v1/messages` | Claude API |
| `/claude/v1/messages` | Claude API（别名） |
| `/gemini/v1/models/:model:generateContent` | Gemini API |
| `/openai/v1/chat/completions` | OpenAI 兼容 API |

## 服务管理

```bash
npm run service:status    # 查看状态
npm run service:logs      # 查看日志
npm run service:restart:daemon  # 重启服务
npm run service:stop      # 停止服务
```

## 许可证

[MIT](LICENSE)
