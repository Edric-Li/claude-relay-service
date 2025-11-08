const logger = require('./logger')
const redis = require('../models/redis')
const config = require('../../config/config')

/**
 * 🛡️ Console账号智能错误处理器
 *
 * 用于系统A（下游系统）对Console账号类型的智能容错处理
 * 区分上游池子的临时错误和Console账号自身的认证问题
 */
class ConsoleErrorHandler {
  /**
   * 🔍 判断是否是Console账号自身的认证错误
   *
   * @param {number} statusCode - HTTP状态码
   * @param {string|Object} errorData - 错误响应数据
   * @returns {boolean} true表示是Console API Key本身的问题
   */
  static isConsoleAuthError(statusCode, errorData) {
    if (statusCode !== 401) {
      return false
    }

    const errorText = typeof errorData === 'string' ? errorData : JSON.stringify(errorData)
    const lowerError = errorText.toLowerCase()

    // 这些关键词表明是Console账号API Key本身的问题（不是上游池子的某个账号）
    const consoleAuthKeywords = [
      'invalid api key',
      'invalid x-api-key',
      'authentication failed',
      'api key not found',
      'invalid authentication',
      'unauthorized api key',
      'api key is invalid',
      'missing api key'
    ]

    const isAuthError = consoleAuthKeywords.some((keyword) => lowerError.includes(keyword))

    if (isAuthError) {
      logger.warn(
        `🔐 Detected Console account authentication error: ${errorText.substring(0, 200)}`
      )
    }

    return isAuthError
  }

  /**
   * 📊 增加错误计数器
   *
   * @param {string} accountId - 账号ID
   * @param {string} errorType - 错误类型 (401/429/529)
   * @param {number} windowSeconds - 时间窗口（秒）
   * @returns {number} 当前错误计数
   */
  static async incrementErrorCounter(accountId, errorType, windowSeconds) {
    const key = `console_account:${accountId}:error:${errorType}`

    try {
      const count = await redis.client.incr(key)
      await redis.client.expire(key, windowSeconds)

      logger.debug(
        `📊 Console account ${accountId} error ${errorType} count: ${count} (window: ${windowSeconds}s)`
      )

      return count
    } catch (error) {
      logger.error(`❌ Failed to increment error counter for ${accountId}:`, error)
      return 0
    }
  }

  /**
   * 🧹 清除所有错误计数器
   *
   * @param {string} accountId - 账号ID
   */
  static async clearErrorCounters(accountId) {
    const errorTypes = ['401', '429', '529']

    try {
      for (const type of errorTypes) {
        const key = `console_account:${accountId}:error:${type}`
        await redis.client.del(key)
      }

      logger.info(`✅ Cleared error counters for Console account ${accountId}`)
    } catch (error) {
      logger.error(`❌ Failed to clear error counters for ${accountId}:`, error)
    }
  }

  /**
   * 📈 获取错误计数
   *
   * @param {string} accountId - 账号ID
   * @param {string} errorType - 错误类型 (401/429/529)
   * @returns {number} 当前错误计数
   */
  static async getErrorCount(accountId, errorType) {
    const key = `console_account:${accountId}:error:${errorType}`

    try {
      const count = await redis.client.get(key)
      return parseInt(count) || 0
    } catch (error) {
      logger.error(`❌ Failed to get error count for ${accountId}:`, error)
      return 0
    }
  }

  /**
   * 🎯 智能错误处理 - 决定是否应该标记账号为不可用
   *
   * @param {string} accountId - 账号ID
   * @param {number} statusCode - HTTP状态码
   * @param {string|Object} errorData - 错误响应数据
   * @returns {Object} { shouldMarkUnavailable: boolean, errorType: string, errorCount: number, threshold: number }
   */
  static async shouldMarkAccountUnavailable(accountId, statusCode, errorData) {
    // 如果未启用智能错误处理，使用旧策略（立即标记）
    if (!config.retry?.console?.intelligentErrorHandling) {
      logger.debug('⚙️ Intelligent error handling is disabled, using legacy behavior')
      return {
        shouldMarkUnavailable: true,
        errorType: statusCode.toString(),
        errorCount: 1,
        threshold: 1
      }
    }

    // 401: 只有明确是Console API Key问题才立即标记
    if (statusCode === 401) {
      const isConsoleAuth = this.isConsoleAuthError(statusCode, errorData)

      if (isConsoleAuth) {
        logger.error(`🚫 Console account ${accountId} has invalid API key (authentication failed)`)
        return {
          shouldMarkUnavailable: true,
          errorType: '401_console_auth',
          errorCount: 1,
          threshold: 1
        }
      }

      // 上游401，使用计数器
      const max401 = config.retry?.console?.max401Errors || 3
      const window = config.retry?.console?.error401Window || 300
      const errorCount = await this.incrementErrorCounter(accountId, '401', window)

      const shouldMark = errorCount >= max401

      if (shouldMark) {
        logger.error(
          `🚫 Console account ${accountId} exceeded 401 threshold: ${errorCount}/${max401}`
        )
      } else {
        logger.warn(
          `⚠️ Upstream 401 for Console account ${accountId}: ${errorCount}/${max401} (not marking yet)`
        )
      }

      return {
        shouldMarkUnavailable: shouldMark,
        errorType: '401_upstream',
        errorCount,
        threshold: max401
      }
    }

    // 429: 使用计数器
    if (statusCode === 429) {
      const max429 = config.retry?.console?.max429Errors || 5
      const window = config.retry?.console?.error429Window || 300
      const errorCount = await this.incrementErrorCounter(accountId, '429', window)

      const shouldMark = errorCount >= max429

      if (shouldMark) {
        logger.error(
          `🚫 Console account ${accountId} exceeded 429 threshold: ${errorCount}/${max429}`
        )
      } else {
        logger.warn(
          `⚠️ Upstream 429 for Console account ${accountId}: ${errorCount}/${max429} (not marking yet)`
        )
      }

      return {
        shouldMarkUnavailable: shouldMark,
        errorType: '429',
        errorCount,
        threshold: max429
      }
    }

    // 529: 使用计数器
    if (statusCode === 529) {
      const max529 = config.retry?.console?.max529Errors || 3
      const window = config.retry?.console?.error529Window || 180
      const errorCount = await this.incrementErrorCounter(accountId, '529', window)

      const shouldMark = errorCount >= max529

      if (shouldMark) {
        logger.error(
          `🚫 Console account ${accountId} exceeded 529 threshold: ${errorCount}/${max529}`
        )
      } else {
        logger.warn(
          `⚠️ Upstream 529 for Console account ${accountId}: ${errorCount}/${max529} (not marking yet)`
        )
      }

      return {
        shouldMarkUnavailable: shouldMark,
        errorType: '529',
        errorCount,
        threshold: max529
      }
    }

    // 其他错误码，默认策略（如400账号禁用、403等）
    return {
      shouldMarkUnavailable: true,
      errorType: statusCode.toString(),
      errorCount: 1,
      threshold: 1
    }
  }
}

module.exports = ConsoleErrorHandler
