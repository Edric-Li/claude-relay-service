# 价格数据同步代理配置指南

本文档说明如何在Docker环境下配置价格数据同步的代理设置。

---

## 📋 目录

- [功能说明](#功能说明)
- [Docker环境配置](#docker环境配置)
- [支持的代理协议](#支持的代理协议)
- [配置示例](#配置示例)
- [验证配置](#验证配置)
- [故障排查](#故障排查)

---

## 🎯 功能说明

### 什么是价格数据同步？

Claude Relay Service 会自动从GitHub仓库下载最新的模型价格数据：
- **数据源**: https://raw.githubusercontent.com/...（GitHub托管）
- **更新频率**:
  - 哈希校验：每10分钟一次
  - 完整更新：每24小时一次
  - 文件变更：实时监听本地文件变化

### 为什么需要代理？

- 在某些网络环境下，访问GitHub可能受限或较慢
- 配置代理可以确保价格数据同步正常工作
- **仅影响价格数据同步**，不影响API请求转发（API转发使用账户独立代理）

---

## 🐳 Docker环境配置

### 方式1: 使用 .env 文件（推荐）

在项目根目录创建或编辑 `.env` 文件：

```bash
# 价格数据同步代理配置
# 支持 socks5:// socks4:// http:// https://

# 示例1: SOCKS5代理（无认证）
PRICING_PROXY_URL=socks5://127.0.0.1:1080

# 示例2: HTTP代理
# PRICING_PROXY_URL=http://127.0.0.1:7890

# 示例3: SOCKS5代理（带认证）
# PRICING_PROXY_URL=socks5://username:password@proxy.example.com:1080

# 示例4: HTTPS代理（带认证）
# PRICING_PROXY_URL=https://user:pass@proxy.company.com:8080
```

然后启动Docker Compose：

```bash
docker-compose up -d
```

### 方式2: docker-compose.yml 直接配置

编辑 `docker-compose.yml`，在 `claude-relay` 服务的 `environment` 部分添加：

```yaml
services:
  claude-relay:
    environment:
      # ... 其他环境变量 ...

      # 💰 价格数据同步代理
      - PRICING_PROXY_URL=socks5://127.0.0.1:1080
```

### 方式3: 命令行传递

```bash
docker-compose up -d \
  -e PRICING_PROXY_URL=socks5://127.0.0.1:1080
```

### 方式4: Docker run 命令

```bash
docker run -d \
  -p 3000:3000 \
  -e REDIS_HOST=redis \
  -e JWT_SECRET=your-secret \
  -e ENCRYPTION_KEY=your-encryption-key-32chars \
  -e PRICING_PROXY_URL=socks5://127.0.0.1:1080 \
  weishaw/claude-relay-service:latest
```

---

## 🔌 支持的代理协议

### SOCKS5 代理（推荐）

```bash
# 无认证
PRICING_PROXY_URL=socks5://127.0.0.1:1080

# 带认证
PRICING_PROXY_URL=socks5://username:password@proxy.example.com:1080
```

**特点**:
- ✅ 性能最好
- ✅ 支持UDP和TCP
- ✅ 最常用于科学上网工具（如Shadowsocks、V2Ray、Clash等）

### SOCKS4 代理

```bash
PRICING_PROXY_URL=socks4://127.0.0.1:1080
```

**特点**:
- ⚠️ 不支持认证
- ⚠️ 仅支持TCP
- ✅ 兼容性好

### HTTP/HTTPS 代理

```bash
# HTTP代理
PRICING_PROXY_URL=http://127.0.0.1:7890

# HTTPS代理
PRICING_PROXY_URL=https://proxy.example.com:8080

# 带认证
PRICING_PROXY_URL=http://username:password@proxy.company.com:8080
```

**特点**:
- ✅ 企业环境常用
- ✅ 支持认证
- ⚠️ 仅支持HTTP(S)流量

---

## 📝 配置示例

### 示例1: Clash代理

Clash默认监听在 `127.0.0.1:7890`（HTTP）和 `127.0.0.1:7891`（SOCKS5）

**使用SOCKS5**（推荐）:

```bash
# .env 文件
PRICING_PROXY_URL=socks5://127.0.0.1:7891
```

**使用HTTP**:

```bash
# .env 文件
PRICING_PROXY_URL=http://127.0.0.1:7890
```

**Docker网络注意事项**:

如果Clash运行在宿主机上，Docker容器需要使用特殊地址访问：

```bash
# Linux
PRICING_PROXY_URL=socks5://172.17.0.1:7891

# macOS/Windows (Docker Desktop)
PRICING_PROXY_URL=socks5://host.docker.internal:7891

# 或者将Clash监听地址改为 0.0.0.0
# 然后使用宿主机IP
PRICING_PROXY_URL=socks5://192.168.1.100:7891
```

### 示例2: V2Ray代理

V2Ray默认监听在 `127.0.0.1:1080`（SOCKS5）

```bash
# .env 文件
PRICING_PROXY_URL=socks5://127.0.0.1:1080

# 如果在Docker中，使用host.docker.internal
PRICING_PROXY_URL=socks5://host.docker.internal:1080
```

### 示例3: 企业代理服务器

```bash
# .env 文件
# HTTP代理（带认证）
PRICING_PROXY_URL=http://employee:P@ssw0rd@proxy.company.com:8080

# 如果密码包含特殊字符，需要URL编码
# 例如: P@ssw0rd -> P%40ssw0rd
PRICING_PROXY_URL=http://employee:P%40ssw0rd@proxy.company.com:8080
```

### 示例4: SSH隧道代理

```bash
# 1. 在宿主机创建SSH隧道
ssh -D 1080 -N user@remote-server.com

# 2. 配置代理
PRICING_PROXY_URL=socks5://127.0.0.1:1080

# 如果在Docker中
PRICING_PROXY_URL=socks5://host.docker.internal:1080
```

---

## ✅ 验证配置

### 1. 检查环境变量是否生效

```bash
# 查看容器环境变量
docker exec claude-relay-claude-relay-1 env | grep PRICING_PROXY_URL

# 应该输出类似:
# PRICING_PROXY_URL=socks5://127.0.0.1:1080
```

### 2. 查看日志

```bash
# 实时查看日志
docker-compose logs -f claude-relay

# 或者查看文件日志
tail -f logs/claude-relay-*.log | grep -i "pricing\|proxy"
```

**成功的日志示例**:

```
🌐 Using proxy for pricing download: socks5://127.0.0.1:1080
✅ Pricing data downloaded successfully
📦 Model pricing loaded: 150 models
```

**失败的日志示例**:

```
❌ Failed to download pricing data: ECONNREFUSED
⚠️ Using fallback pricing data
```

### 3. 触发手动更新

```bash
# 重启服务触发更新
docker-compose restart claude-relay

# 或删除本地缓存，触发重新下载
rm -f data/model_pricing.json data/model_pricing.sha256
docker-compose restart claude-relay
```

### 4. 检查数据文件

```bash
# 检查价格数据文件
ls -lh data/model_pricing.json data/model_pricing.sha256

# 查看文件内容
cat data/model_pricing.json | jq '.models | length'
# 应该输出模型数量，例如: 150
```

---

## 🔍 故障排查

### 问题1: 代理连接失败

**错误日志**:
```
❌ Failed to download pricing data: ECONNREFUSED
```

**解决方案**:

1. **检查代理是否运行**:
   ```bash
   # 检查SOCKS5代理
   curl --socks5 127.0.0.1:1080 https://www.google.com

   # 检查HTTP代理
   curl -x http://127.0.0.1:7890 https://www.google.com
   ```

2. **检查Docker网络配置**:
   - Docker容器无法直接访问 `127.0.0.1`（宿主机地址）
   - Linux: 使用 `172.17.0.1`（Docker网关IP）
   - macOS/Windows: 使用 `host.docker.internal`
   - 或者配置代理监听 `0.0.0.0`（所有接口）

3. **修改代理监听地址** (以Clash为例):
   ```yaml
   # Clash配置文件 config.yaml
   mixed-port: 7890
   allow-lan: true  # 允许局域网连接
   bind-address: '0.0.0.0'  # 监听所有接口
   ```

### 问题2: 代理协议错误

**错误日志**:
```
⚠️ Unknown proxy protocol in PRICING_PROXY_URL: xxx://, expected socks5://, socks4://, http:// or https://
```

**解决方案**:

确保使用正确的协议前缀：
- ✅ `socks5://127.0.0.1:1080`
- ✅ `http://127.0.0.1:7890`
- ❌ `127.0.0.1:1080`（缺少协议）
- ❌ `socks://127.0.0.1:1080`（应该是socks5）

### 问题3: 认证失败

**错误日志**:
```
❌ Proxy authentication failed
```

**解决方案**:

1. **检查用户名密码**是否正确
2. **URL编码特殊字符**:
   ```bash
   # 错误: 密码包含@符号
   PRICING_PROXY_URL=socks5://user:P@ss@proxy.com:1080

   # 正确: @编码为%40
   PRICING_PROXY_URL=socks5://user:P%40ss@proxy.com:1080
   ```

3. **特殊字符URL编码对照表**:
   ```
   @  ->  %40
   :  ->  %3A
   /  ->  %2F
   ?  ->  %3F
   #  ->  %23
   [  ->  %5B
   ]  ->  %5D
   !  ->  %21
   $  ->  %24
   &  ->  %26
   '  ->  %27
   (  ->  %28
   )  ->  %29
   *  ->  %2A
   +  ->  %2B
   ,  ->  %2C
   ;  ->  %3B
   =  ->  %3D
   ```

### 问题4: Docker内无法访问宿主机代理

**症状**: 配置了代理但仍然连接失败

**解决方案**:

**Linux系统**:
```bash
# 1. 获取Docker网关IP
docker network inspect claude-relay-network | grep Gateway

# 2. 使用网关IP
PRICING_PROXY_URL=socks5://172.17.0.1:1080
```

**macOS/Windows (Docker Desktop)**:
```bash
# 使用特殊域名
PRICING_PROXY_URL=socks5://host.docker.internal:1080
```

**通用方案**（推荐）:
```bash
# 1. 修改代理软件监听地址为 0.0.0.0

# 2. 获取宿主机IP
# Linux/macOS
ifconfig | grep "inet "
# 输出: inet 192.168.1.100 ...

# Windows
ipconfig

# 3. 使用宿主机IP
PRICING_PROXY_URL=socks5://192.168.1.100:1080
```

### 问题5: 价格数据未更新

**症状**: 配置了代理，日志显示成功，但数据仍然是旧的

**解决方案**:

```bash
# 1. 删除本地缓存
rm -f data/model_pricing.json data/model_pricing.sha256

# 2. 重启服务
docker-compose restart claude-relay

# 3. 查看日志确认下载
docker-compose logs -f claude-relay | grep -i pricing

# 4. 验证文件时间戳
ls -lh data/model_pricing.json
# 应该显示最新的修改时间
```

---

## 🎯 最佳实践

### 1. 开发环境

```bash
# .env.development
# 使用本地代理，方便调试
PRICING_PROXY_URL=socks5://127.0.0.1:1080
```

### 2. 生产环境

```bash
# .env.production
# 使用稳定的企业代理或云服务代理
PRICING_PROXY_URL=http://proxy.company.com:8080

# 或者不配置代理（如果网络环境允许直连GitHub）
# PRICING_PROXY_URL=
```

### 3. 监控和告警

在生产环境，建议监控价格数据同步状态：

```bash
# 检查脚本示例
#!/bin/bash
PRICING_FILE="data/model_pricing.json"
MAX_AGE_HOURS=48  # 48小时

if [ -f "$PRICING_FILE" ]; then
    FILE_AGE=$(( ($(date +%s) - $(stat -f %m "$PRICING_FILE")) / 3600 ))
    if [ $FILE_AGE -gt $MAX_AGE_HOURS ]; then
        echo "⚠️ 警告: 价格数据已超过 ${FILE_AGE} 小时未更新"
        # 发送告警通知
    else
        echo "✅ 价格数据正常，最后更新于 ${FILE_AGE} 小时前"
    fi
else
    echo "❌ 错误: 价格数据文件不存在"
fi
```

### 4. 安全建议

- ✅ 使用HTTPS/SOCKS5代理（加密传输）
- ✅ 代理认证信息不要硬编码在代码中
- ✅ 使用环境变量或密钥管理服务
- ⚠️ 避免在日志中输出代理密码
- ⚠️ 定期更新代理密码

---

## 📚 相关文档

- [项目主文档](../CLAUDE.md) - 项目架构说明
- [Docker部署指南](DOCKER_PUBLISH_GUIDE.md) - Docker镜像构建和推送
- [环境变量配置](.env.example) - 所有可用环境变量

---

## 💡 提示

- 价格数据同步的代理配置是**可选的**，仅在需要时配置
- 配置后会立即生效，无需重启服务（下次同步时使用）
- 如果不配置代理，系统会直连GitHub下载数据
- 如果下载失败，会使用内置的备用价格数据（可能不是最新）

---

**最后更新**: 2025-11-08

**状态**: ✅ Production Ready
