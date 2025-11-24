# Console账号智能错误处理与池子故障转移

## 📖 背景

### 问题场景

当使用 **Console账号类型** 对接另一个 claude-relay-service 实例（上游池子）时，会遇到以下问题：

```
系统A (下游) → Console账号 → 系统B (上游池子，有多个账号)
```

**原有问题**：
- 系统B的池子里**任何一个账号**出现 429/401/529 错误
- 系统A就会把**整个Console账号**标记为不可用 ❌
- 导致整个服务链路中断，即使系统B还有其他健康账号

**这是不合理的**，因为：
1. 系统B作为一个**池子**，应该自己处理单个账号的故障
2. 只有整个池子不可用时，才应该影响下游
3. 单个账号的临时问题不应该直接透传

## 🎯 解决方案

我们实现了**双层优化架构**：

### 1️⃣ 系统B（上游池子）- 自动故障转移（可选）

当池子里某个账号出现临时错误时，自动切换到其他账号重试，而不是直接返回错误。

**配置环境变量**：
```bash
# 启用池子故障转移（默认关闭）
ENABLE_POOL_FAILOVER=true

# 最多重试次数（默认2次）
POOL_FAILOVER_MAX_RETRIES=2

# 重试时是否清除粘性会话，让调度器选择新账号（默认true）
POOL_FAILOVER_CLEAR_SESSION=true
```

**工作原理**：
- 账号A返回429 → 自动选择账号B重试
- 账号B返回529 → 自动选择账号C重试
- 只有所有账号都失败时才返回错误

### 2️⃣ 系统A（下游）- Console账号智能容错（默认启用）

即使系统B返回临时错误，也不立即标记Console账号为不可用，而是使用**错误计数器**和**阈值机制**。

**配置环境变量**：
```bash
# 启用智能错误处理（默认启用）
CONSOLE_INTELLIGENT_ERROR_HANDLING=true

# 401错误：连续3次才标记为unauthorized
CONSOLE_MAX_401_ERRORS=3
CONSOLE_401_ERROR_WINDOW=300  # 5分钟窗口

# 429错误：5分钟内5次才标记为rate_limited
CONSOLE_MAX_429_ERRORS=5
CONSOLE_429_ERROR_WINDOW=300  # 5分钟窗口

# 529错误：3分钟内3次才标记为overloaded
CONSOLE_MAX_529_ERRORS=3
CONSOLE_529_ERROR_WINDOW=180  # 3分钟窗口

# Console请求重试次数（给上游池子时间进行故障转移）
CONSOLE_REQUEST_MAX_RETRIES=1
```

## 📊 工作流程

### 场景1：系统B有故障转移 + 系统A有智能容错

```
请求1: 系统A → Console账号 → 系统B (账号1返回429)
       ↳ 系统B自动切换账号2 → 成功 ✅
       ↳ 系统A收到成功响应

请求2: 系统A → Console账号 → 系统B (账号1返回429)
       ↳ 系统B自动切换账号2 (也429)
       ↳ 系统B自动切换账号3 → 成功 ✅
       ↳ 系统A收到成功响应

请求3: 系统A → Console账号 → 系统B (所有账号都429)
       ↳ 系统B重试失败，返回429
       ↳ 系统A记录: Console账号 429计数 1/5 ⚠️
       ↳ Console账号仍然可用

请求4-7: 重复场景3，429计数累积到5
       ↳ 系统A标记Console账号为rate_limited 🚫
```

### 场景2：仅系统A有智能容错（系统B未启用故障转移）

```
请求1: 系统A → Console账号 → 系统B (账号1返回429)
       ↳ 系统B直接返回429
       ↳ 系统A记录: Console账号 429计数 1/5 ⚠️
       ↳ Console账号仍然可用

请求2-4: 继续收到429
       ↳ 429计数: 2/5 → 3/5 → 4/5 ⚠️

请求5: 第5次429
       ↳ 429计数: 5/5
       ↳ 系统A标记Console账号为rate_limited 🚫
```

### 场景3：401错误 - 区分上游问题和Console API Key问题

```
情况A：上游某个账号token失效
请求: 系统A → Console账号 → 系统B (上游账号返回401)
      ↳ 错误消息: "upstream oauth token expired"
      ↳ 系统A判断: 这不是Console API Key的问题 ✅
      ↳ 401计数: 1/3 ⚠️（不标记）

情况B：Console API Key本身失效
请求: 系统A → Console账号 → 系统B
      ↳ 错误消息: "invalid api key"
      ↳ 系统A判断: Console API Key失效 ❌
      ↳ 立即标记Console账号为unauthorized 🚫
```

## 🔧 关键实现

### 1. 错误分类逻辑

**永久性错误**（立即标记）：
- 400 (organization disabled) - 账号被封禁
- 403 (Forbidden) - 禁止访问
- 401 + "invalid api key" - Console API Key失效

**临时性错误**（计数器阈值）：
- 401 + 其他错误消息 - 上游账号问题
- 429 - 限流
- 529 - 服务过载
- 5xx - 服务器错误

### 2. Redis错误计数器

```
Key格式：console_account:{accountId}:error:{errorType}
errorType: "401" | "429" | "529"

示例：
console_account:abc123:error:429 = 3  (TTL: 300秒)
console_account:abc123:error:529 = 1  (TTL: 180秒)
```

### 3. 错误消息识别

判断401是否为Console API Key问题的关键词：
- `invalid api key`
- `invalid x-api-key`
- `authentication failed`
- `api key not found`
- `invalid authentication`
- `unauthorized api key`

**不包含这些关键词** → 认为是上游池子的某个账号问题 → 使用计数器

## 📈 监控和日志

### 智能容错日志示例

```
# Console账号收到上游429，未达到阈值
⚠️ Upstream 429 for Console account abc123, not marking as rate limited yet (3/5)

# 达到阈值，标记为不可用
🚫 Marking Console account abc123 as rate limited (5/5)

# 识别为Console API Key问题
🔐 Detected Console account authentication error: invalid api key
🚫 Marking Console account abc123 as unauthorized: 401_console_auth (1/1)

# 请求成功，清除错误计数
✅ Cleared error counters for Console account abc123
```

### 查看错误计数

使用Redis CLI查看：
```bash
redis-cli

# 查看某个Console账号的所有错误计数
keys console_account:your_account_id:error:*

# 查看具体计数值
get console_account:your_account_id:error:429
# 返回: "3"

# 查看剩余TTL
ttl console_account:your_account_id:error:429
# 返回: 245 (秒)
```

## ⚙️ 推荐配置

### 场景A：高可用性优先（宽松策略）

适合系统B是可靠的大型池子（有10+账号）：

```bash
# 系统A配置
CONSOLE_INTELLIGENT_ERROR_HANDLING=true
CONSOLE_MAX_401_ERRORS=5         # 宽松
CONSOLE_MAX_429_ERRORS=10        # 宽松
CONSOLE_MAX_529_ERRORS=5         # 宽松
CONSOLE_401_ERROR_WINDOW=600     # 10分钟
CONSOLE_429_ERROR_WINDOW=600
CONSOLE_529_ERROR_WINDOW=300
```

### 场景B：平衡配置（推荐）

适合大多数情况：

```bash
# 系统A配置（默认值）
CONSOLE_INTELLIGENT_ERROR_HANDLING=true
CONSOLE_MAX_401_ERRORS=3
CONSOLE_MAX_429_ERRORS=5
CONSOLE_MAX_529_ERRORS=3
CONSOLE_401_ERROR_WINDOW=300
CONSOLE_429_ERROR_WINDOW=300
CONSOLE_529_ERROR_WINDOW=180
```

### 场景C：严格策略（快速故障检测）

适合系统B池子较小或不稳定：

```bash
# 系统A配置
CONSOLE_INTELLIGENT_ERROR_HANDLING=true
CONSOLE_MAX_401_ERRORS=2         # 严格
CONSOLE_MAX_429_ERRORS=3         # 严格
CONSOLE_MAX_529_ERRORS=2         # 严格
CONSOLE_401_ERROR_WINDOW=180     # 3分钟
CONSOLE_429_ERROR_WINDOW=180
CONSOLE_529_ERROR_WINDOW=120
```

### 场景D：禁用智能容错（旧行为）

如果需要恢复旧的"一次失败就停用"行为：

```bash
CONSOLE_INTELLIGENT_ERROR_HANDLING=false
```

## 🎓 最佳实践

### 1. 系统B（上游池子）配置

✅ **推荐做法**：
- 配置足够多的账号（建议3个以上）
- 启用故障转移（`ENABLE_POOL_FAILOVER=true`）
- 监控账号健康状态
- 及时替换失效账号

❌ **避免**：
- 只有1-2个账号的池子
- 让单个账号的错误直接透传
- 不监控池子整体健康度

### 2. 系统A（下游）配置

✅ **推荐做法**：
- 启用智能容错（默认启用）
- 根据上游池子规模调整阈值
- 监控Console账号错误计数
- 设置Webhook通知

❌ **避免**：
- 阈值设置过低（容易误标记）
- 阈值设置过高（无法及时发现问题）
- 完全禁用智能容错

### 3. 监控建议

监控以下指标：
```bash
# Redis中的错误计数
console_account:*:error:*

# 日志关键词
"Upstream 429"
"Upstream 401"
"Marking Console account"
"exceeded * threshold"
```

## 🔍 故障排查

### 问题1：Console账号频繁被标记为不可用

**可能原因**：
- 阈值设置过低
- 上游池子账号不足
- 上游池子未启用故障转移

**解决方案**：
1. 增加阈值：`CONSOLE_MAX_429_ERRORS=10`
2. 增加时间窗口：`CONSOLE_429_ERROR_WINDOW=600`
3. 检查上游池子配置
4. 查看Redis错误计数：`keys console_account:*:error:*`

### 问题2：明显的API Key问题未被及时检测

**可能原因**：
- 智能错误处理误判为上游问题
- 阈值过高

**解决方案**：
1. 检查日志中的错误消息格式
2. 降低401阈值：`CONSOLE_MAX_401_ERRORS=2`
3. 查看是否有关键词匹配

### 问题3：如何手动清除错误计数

```bash
# Redis CLI
redis-cli

# 清除特定Console账号的所有错误计数
del console_account:your_account_id:error:401
del console_account:your_account_id:error:429
del console_account:your_account_id:error:529

# 或者使用通配符（Redis 6.2+）
redis-cli --scan --pattern 'console_account:your_account_id:error:*' | xargs redis-cli del
```

## 🚀 升级指南

### 从旧版本升级

1. **备份配置**：
```bash
cp .env .env.backup
cp config/config.js config/config.js.backup
```

2. **更新代码**：
```bash
git pull
npm install
```

3. **添加新配置**（可选）：
```bash
# .env
CONSOLE_INTELLIGENT_ERROR_HANDLING=true  # 默认启用
CONSOLE_MAX_429_ERRORS=5
CONSOLE_429_ERROR_WINDOW=300
```

4. **重启服务**：
```bash
npm run service:stop
npm run service:start:daemon
```

5. **验证**：
```bash
# 查看日志
npm run service:logs

# 应该看到智能错误处理的日志
# ⚠️ Upstream 429 for Console account xxx, not marking yet (1/5)
```

### 回退到旧行为

如果需要临时禁用：
```bash
# .env
CONSOLE_INTELLIGENT_ERROR_HANDLING=false

# 重启服务
npm run service:stop
npm run service:start:daemon
```

## 📚 相关文件

- 配置文件：`config/config.example.js` (retry配置段)
- Console错误处理器：`src/utils/consoleErrorHandler.js`
- 重试助手：`src/utils/retryHelper.js`
- Console转发服务：`src/services/claudeConsoleRelayService.js`

## 🤝 贡献

如果你发现任何问题或有改进建议，欢迎：
1. 提交Issue
2. 提交Pull Request
3. 更新文档

---

**注意**：本功能已在生产环境测试，但仍建议：
1. 先在测试环境验证
2. 逐步调整阈值参数
3. 密切监控日志和指标
