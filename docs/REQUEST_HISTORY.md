# 请求历史功能

## 概述

请求历史功能记录所有API请求的详细信息，包括性能指标、token使用、成本统计等，帮助监控和分析系统使用情况。

## 功能特性

### ✅ 已实现功能

- **异步写入**：采用 fire-and-forget 模式，对API响应几乎零影响（< 0.1ms）
- **多维度筛选**：支持按时间、API Key、模型、账户类型、状态筛选
- **详细统计**：总请求数、成功率、失败率、总花费等统计
- **CSV导出**：支持导出历史数据为CSV格式
- **Web界面**：完整的前端查询界面，支持明暗主题
- **自动清理**：根据保留策略自动清理旧数据

### 📊 记录的信息

每条历史记录包含以下字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| **timestamp** | 请求时间 | `2025-11-10T10:30:45.123Z` |
| **requestId** | 唯一请求ID | `req_1699612845123_abc123` |
| **apiKeyId** | API Key ID | `key_xyz` |
| **apiKeyName** | API Key 名称 | `Production App` |
| **accountType** | 账户类型 | `claude-official`, `gemini`, etc. |
| **accountId** | 账户ID | `acc_456` |
| **accountName** | 账户名称 | `Claude Account 1` |
| **model** | 使用的模型 | `claude-sonnet-4-5-20250929` |
| **endpoint** | 请求端点 | `/api/v1/messages` |
| **isStreaming** | 是否流式 | `true` / `false` |
| **timeToFirstByte** | 首字延迟（毫秒） | `1234` |
| **totalDuration** | 总用时（毫秒） | `5678` |
| **inputTokens** | 输入tokens | `1000` |
| **outputTokens** | 输出tokens | `500` |
| **cacheCreationTokens** | 缓存创建tokens | `200` |
| **cacheReadTokens** | 缓存读取tokens | `800` |
| **totalCost** | 总花费（USD） | `0.01905` |
| **statusCode** | HTTP状态码 | `200` |
| **success** | 是否成功 | `true` / `false` |
| **errorMessage** | 错误信息（如果失败） | `null` |
| **clientIp** | 客户端IP | `192.168.1.100` |
| **userAgent** | User-Agent | `ClaudeCode/1.0.0` |
| **clientType** | 客户端类型 | `ClaudeCode` |

## 配置

### 环境变量

在 `.env` 文件中配置：

```bash
# 📊 请求历史配置
REQUEST_HISTORY_ENABLED=true  # 启用请求历史记录（默认true）
REQUEST_HISTORY_MAX_ENTRIES=100000  # 最大记录条数（默认100000）
REQUEST_HISTORY_RETENTION_DAYS=30  # 数据保留天数（默认30）
REQUEST_HISTORY_ASYNC_WRITE=true  # 异步写入（默认true，推荐）
REQUEST_HISTORY_SAMPLE_RATE=1.0  # 采样率，0.0-1.0（默认1.0）
```

### 配置说明

- **REQUEST_HISTORY_ENABLED**:
  - 设置为 `false` 完全禁用历史记录功能
  - 默认 `true` 启用

- **REQUEST_HISTORY_MAX_ENTRIES**:
  - Redis Stream最大条目数
  - 达到限制后自动删除最旧的记录
  - 估算内存：100,000条 ≈ 60MB

- **REQUEST_HISTORY_RETENTION_DAYS**:
  - 数据保留天数
  - 定期清理任务会删除超过此天数的记录

- **REQUEST_HISTORY_ASYNC_WRITE**:
  - **强烈推荐设置为 `true`**
  - 异步写入对API响应性能影响 < 0.1ms
  - 设置为 `false` 会增加 1-3ms 延迟

- **REQUEST_HISTORY_SAMPLE_RATE**:
  - 采样率，适用于超高流量场景
  - `1.0` = 记录所有请求
  - `0.1` = 随机记录10%的请求
  - `0.5` = 随机记录50%的请求

## 性能影响

### 低流量场景（< 100 req/s）
- **影响**: 几乎无感知
- **额外开销**: +0.1ms（异步）
- **建议**: 默认配置即可

### 中等流量（100-1000 req/s）
- **影响**: 轻微
- **额外开销**: +0.1-0.5ms（异步）
- **建议**: 保持 `REQUEST_HISTORY_ASYNC_WRITE=true`

### 高流量（> 1000 req/s）
- **影响**: 需要优化
- **建议**:
  - 设置采样率 `REQUEST_HISTORY_SAMPLE_RATE=0.1`（记录10%）
  - 或降低最大条目数 `REQUEST_HISTORY_MAX_ENTRIES=50000`

## API 端点

### 1. 查询请求历史

```http
GET /admin/request-history
```

**查询参数**:
- `startTime`: 开始时间（ISO 8601格式）
- `endTime`: 结束时间
- `apiKeyId`: API Key ID过滤
- `model`: 模型过滤（模糊匹配）
- `accountType`: 账户类型过滤
- `success`: 成功/失败过滤（`true`/`false`）
- `limit`: 返回条数限制（默认100）
- `offset`: 偏移量（分页）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "records": [ /* ... */ ],
    "total": 1234,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

### 2. 获取统计数据

```http
GET /admin/request-history/stats
```

**查询参数**:
- `startTime`: 开始时间
- `endTime`: 结束时间
- `apiKeyId`: API Key ID过滤

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalRequests": 10000,
    "successRequests": 9500,
    "failedRequests": 500,
    "totalCost": 12.5678,
    "totalInputTokens": 1000000,
    "totalOutputTokens": 500000,
    "avgTimeToFirstByte": 1234,
    "avgTotalDuration": 5678,
    "modelDistribution": {
      "claude-sonnet-4-5-20250929": 5000,
      "claude-3-5-sonnet-20241022": 3000,
      "gemini-2.0-flash-exp": 2000
    },
    "accountTypeDistribution": { /* ... */ },
    "hourlyStats": { /* ... */ }
  }
}
```

### 3. 导出CSV

```http
GET /admin/request-history/export
```

**查询参数**: 同查询接口

**响应**:
- Content-Type: `text/csv`
- 自动下载CSV文件

### 4. 清理旧数据

```http
POST /admin/request-history/cleanup
```

**响应示例**:
```json
{
  "success": true,
  "message": "Cleaned up 1234 old records",
  "deleted": 1234
}
```

## Web界面使用

### 访问路径

登录管理后台后，点击导航栏的 **"请求历史"** 标签。

### 主要功能

1. **筛选查询**
   - 时间范围筛选（默认最近24小时）
   - API Key筛选（下拉选择）
   - 模型筛选（模糊匹配）
   - 账户类型筛选
   - 成功/失败状态筛选

2. **统计卡片**
   - 总请求数
   - 成功请求数和成功率
   - 失败请求数和失败率
   - 总花费

3. **请求列表**
   - 分页显示
   - 每行显示关键信息
   - 点击"眼睛"图标查看详情

4. **详情模态框**
   - 完整的请求信息
   - 性能指标
   - Token使用详情
   - 成本细分
   - 客户端信息
   - 错误信息（如果失败）

5. **导出功能**
   - 点击"导出CSV"按钮
   - 根据当前筛选条件导出
   - 自动下载CSV文件

## 集成到代码中

### 基础集成（简单）

如果你只需要基本的历史记录，可以手动在关键位置调用：

```javascript
const { recordRequestHistory } = require('../utils/requestHistoryHelper')

// 在请求处理完成后记录
recordRequestHistory({
  requestId: 'req_123',
  apiKey: req.apiKey,  // req.apiKey 对象
  accountType: 'claude-official',
  accountId: 'acc_123',
  accountName: 'My Account',
  model: 'claude-sonnet-4-5-20250929',
  endpoint: req.path,
  isStreaming: true,
  timeToFirstByte: 1234,
  usageObject: {  // 从usage回调获取
    input_tokens: 1000,
    output_tokens: 500,
    cache_creation_input_tokens: 200,
    cache_read_input_tokens: 800
  },
  costInfo: { totalCost: 0.01905 },  // 从pricingService获取
  statusCode: 200,
  success: true,
  clientIp: req.ip,
  userAgent: req.get('user-agent'),
  startTime: startTime  // 用于计算totalDuration
})
```

### 完整集成（推荐）

在usage捕获回调中集成，确保获取到真实的token和成本数据：

```javascript
// 在 usage 回调中记录
async (usageData) => {
  if (usageData && usageData.input_tokens !== undefined) {
    // 先记录usage统计
    await apiKeyService.recordUsageWithDetails(
      req.apiKey.id,
      usageObject,
      model,
      accountId,
      accountType
    )

    // 然后记录请求历史
    const { recordRequestHistory } = require('../utils/requestHistoryHelper')
    recordRequestHistory({
      requestId: requestId,
      apiKey: req.apiKey,
      accountType: accountType,
      accountId: accountId,
      accountName: accountName,
      model: model,
      endpoint: req.path,
      isStreaming: true,
      timeToFirstByte: firstByteTime - startTime,
      usageObject: usageData,
      costInfo: await calculateCost(usageData, model),
      statusCode: 200,
      success: true,
      clientIp: req.ip,
      userAgent: req.get('user-agent'),
      startTime: startTime
    })
  }
}
```

## 数据存储

### Redis Streams

请求历史使用 Redis Streams 存储，提供：
- **高性能写入**: < 1ms per record
- **时间序列特性**: 天然支持时间范围查询
- **自动清理**: MAXLEN 限制自动淘汰旧数据
- **持久化**: Redis持久化保证数据不丢失

### 数据结构

**Stream Key**: `request_history_stream`

**Entry Format**:
```
ID: <timestamp-sequence>
data: <JSON-encoded record>
```

## 常见问题

### Q: 如何禁用请求历史？

A: 在 `.env` 文件中设置 `REQUEST_HISTORY_ENABLED=false`

### Q: 历史记录占用多少内存？

A: 每条记录约 500-800 字节，10万条约 50-80MB

### Q: 会影响API性能吗？

A: 采用异步写入时，性能影响 < 0.1ms，几乎可忽略

### Q: 如何减少内存占用？

A: 方法：
1. 降低 `REQUEST_HISTORY_MAX_ENTRIES`
2. 减少 `REQUEST_HISTORY_RETENTION_DAYS`
3. 设置采样率 `REQUEST_HISTORY_SAMPLE_RATE < 1.0`

### Q: 数据会自动清理吗？

A: 是的，有两种清理机制：
1. Redis Stream MAXLEN 自动淘汰超过最大条目数的记录
2. 可以调用 `/admin/request-history/cleanup` API手动清理

### Q: 如何备份历史数据？

A: 使用导出功能：
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/admin/request-history/export" \
  > history-backup.csv
```

### Q: 支持实时查询吗？

A: 是的，Web界面支持实时查询，默认显示最近24小时的数据

## 维护建议

### 日常维护

1. **监控内存使用**
   ```bash
   redis-cli INFO memory
   redis-cli XLEN request_history_stream
   ```

2. **定期导出备份**
   - 每周或每月导出一次历史数据
   - 保存为CSV或导入数据库

3. **调整保留策略**
   - 根据实际需求调整 `RETENTION_DAYS`
   - 高流量系统可以缩短保留期或使用采样

### 性能优化

1. **超高流量场景**
   - 设置采样率：`REQUEST_HISTORY_SAMPLE_RATE=0.1`
   - 减少最大条目：`REQUEST_HISTORY_MAX_ENTRIES=50000`

2. **低内存环境**
   - 减少保留天数：`REQUEST_HISTORY_RETENTION_DAYS=7`
   - 减少最大条目：`REQUEST_HISTORY_MAX_ENTRIES=50000`

3. **批量写入优化**（待实现）
   - 当前使用单条写入
   - 未来可以实现批量写入进一步提升性能

## 未来改进计划

- [ ] 批量写入优化
- [ ] 支持导出到外部数据库（PostgreSQL/MySQL）
- [ ] 更丰富的统计图表
- [ ] 实时请求监控（WebSocket）
- [ ] 告警功能（失败率过高时通知）
- [ ] 地理位置分析（根据IP）
- [ ] 性能异常检测

## 技术实现

### 核心组件

1. **requestHistoryService.js**: 核心服务，处理记录、查询、导出
2. **requestHistoryHelper.js**: 辅助工具，简化集成
3. **RequestHistoryView.vue**: 前端界面
4. **admin.js**: API端点路由

### 关键技术点

- **异步写入**: Promise不await，fire-and-forget
- **Redis Streams**: 高性能时序数据存储
- **LRU淘汰**: MAXLEN ~ threshold
- **CSV导出**: 服务端生成，前端下载
- **响应式设计**: 支持移动端、平板、桌面

## 总结

请求历史功能提供了完整的API请求监控和分析能力，帮助你：

✅ 追踪所有请求的详细信息
✅ 分析性能和成本
✅ 排查问题和错误
✅ 优化系统配置
✅ 生成使用报告

采用异步写入设计，对系统性能影响极小，推荐在生产环境启用。
