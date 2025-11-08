const logger = require('./logger')

/**
 * 🔄 自动重试助手 - 用于池子内账号故障转移
 *
 * 当某个账号出现临时错误（429/529等）时，自动切换到其他账号重试
 * 适用于系统B（上游池子）的场景
 */
class RetryHelper {
  /**
   * 检查错误是否应该触发重试（临时错误，非永久性错误）
   */
  static shouldRetryError(_error, statusCode) {
    // 永久性错误，不应该重试
    const permanentErrors = [
      400, // Bad Request - 请求格式错误
      403, // Forbidden - 禁止访问（账号被封禁等）
      404, // Not Found
      422 // Unprocessable Entity
    ]

    if (permanentErrors.includes(statusCode)) {
      return false
    }

    // 应该重试的临时错误
    const retryableStatusCodes = [
      429, // Too Many Requests - 限流
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
      529 // Overload - Claude特有
    ]

    if (retryableStatusCodes.includes(statusCode)) {
      return true
    }

    // 401需要特殊判断：如果是上游池子的某个账号token失效，应该重试
    // 但如果是Console账号自己的API Key问题，不应该重试
    if (statusCode === 401) {
      return true // 默认重试，让调度器选择其他账号
    }

    return false
  }

  /**
   * 执行带重试的请求
   *
   * @param {Object} options - 重试选项
   * @param {Function} options.requestFunc - 执行请求的函数
   * @param {Function} options.selectAccountFunc - 选择账号的函数
   * @param {Object} options.apiKeyData - API Key数据
   * @param {Object} options.requestBody - 请求体
   * @param {string} options.sessionHash - 会话哈希（可选）
   * @param {number} options.maxRetries - 最大重试次数（默认2次）
   * @param {boolean} options.clearSessionOnRetry - 重试时是否清除粘性会话（默认true）
   */
  static async executeWithRetry({
    requestFunc,
    selectAccountFunc,
    apiKeyData,
    requestBody,
    sessionHash = null,
    maxRetries = 2,
    clearSessionOnRetry = true
  }) {
    let lastError = null
    let lastStatusCode = null
    const attemptedAccounts = new Set() // 记录尝试过的账号，避免重复

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 第一次尝试使用原始sessionHash
        // 重试时如果clearSessionOnRetry=true，则不使用sessionHash，让调度器选择新账号
        const effectiveSessionHash = attempt === 0 || !clearSessionOnRetry ? sessionHash : null

        // 选择账号
        const accountSelection = await selectAccountFunc(
          apiKeyData,
          effectiveSessionHash,
          requestBody.model
        )

        const { accountId, accountType } = accountSelection

        // 检查是否已经尝试过这个账号（避免死循环）
        if (attemptedAccounts.has(accountId)) {
          logger.warn(
            `⚠️ Account ${accountId} already attempted, skipping to avoid loop (attempt ${attempt + 1}/${maxRetries + 1})`
          )
          continue
        }

        attemptedAccounts.add(accountId)

        logger.info(
          `🔄 Retry attempt ${attempt + 1}/${maxRetries + 1} using account ${accountId} (${accountType})`
        )

        // 执行请求
        const result = await requestFunc(accountId, accountType)

        // 请求成功，返回结果
        logger.info(`✅ Request succeeded on attempt ${attempt + 1}`)
        return result
      } catch (error) {
        lastError = error
        lastStatusCode = error.statusCode || error.status || null

        logger.warn(
          `⚠️ Request failed on attempt ${attempt + 1}/${maxRetries + 1}: ${error.message} (status: ${lastStatusCode})`
        )

        // 检查是否应该重试
        if (!this.shouldRetryError(error, lastStatusCode)) {
          logger.info(`❌ Error ${lastStatusCode} is not retryable, stopping retry`)
          throw error
        }

        // 如果是最后一次尝试，不再重试
        if (attempt >= maxRetries) {
          logger.error(`❌ All ${maxRetries + 1} retry attempts failed, giving up`)
          throw error
        }

        // 等待一小段时间再重试（指数退避）
        const delayMs = Math.min(100 * Math.pow(2, attempt), 1000) // 最多1秒
        logger.info(`⏳ Waiting ${delayMs}ms before retry...`)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }

    // 理论上不会到这里，但以防万一
    throw lastError || new Error('Retry failed with unknown error')
  }

  /**
   * 为Console账号类型创建专用的重试包装器
   *
   * 当Console账号调用的上游池子返回临时错误时，不应该立即标记账号为不可用
   * 而是应该让上游池子自己处理（切换其他账号）
   */
  static async executeConsoleRequestWithRetry({
    requestFunc,
    accountId,
    _apiKeyData,
    _requestBody,
    maxRetries = 1 // Console账号只重试1次，因为上游应该有自己的重试
  }) {
    let lastError = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.info(
          `🔄 Console account ${accountId} request attempt ${attempt + 1}/${maxRetries + 1}`
        )

        const result = await requestFunc()

        logger.info(`✅ Console request succeeded on attempt ${attempt + 1}`)
        return result
      } catch (error) {
        lastError = error
        const statusCode = error.statusCode || error.status || error.response?.status

        logger.warn(
          `⚠️ Console request failed on attempt ${attempt + 1}/${maxRetries + 1}: ${error.message} (status: ${statusCode})`
        )

        // 对于Console账号，只有确定是上游临时错误才重试
        // 如果是认证错误或永久性错误，直接抛出
        if (!this.shouldRetryError(error, statusCode)) {
          logger.info(`❌ Console error ${statusCode} is not retryable, stopping retry`)
          throw error
        }

        if (attempt >= maxRetries) {
          logger.warn(`❌ Console request failed after ${maxRetries + 1} attempts`)
          throw error
        }

        // 短暂延迟
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    throw lastError
  }
}

module.exports = RetryHelper
