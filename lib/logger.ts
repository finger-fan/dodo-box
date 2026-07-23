import { Logger, LogLevel } from '@aparajita/capacitor-logger'

/**
 * 全局日志实例
 * 
 * 使用方式：
 * ```ts
 * import { logger } from '@/lib/logger'
 * 
 * logger.debug('调试信息')
 * logger.info('普通信息')
 * logger.warn('警告')
 * logger.error('错误', error)  // 可选附加错误对象
 * ```
 * 
 * Android logcat 查看：
 * ```bash
 * adb logcat -s DodoBox
 * ```
 */
export const logger = new Logger('DodoBox', {
  level: LogLevel.debug,
  labels: {
    error: '🔴',
    warn: '🟠',
    info: '🟢',
    debug: '🔎',
  },
})

/**
 * 创建带模块前缀的子 logger
 * 
 * 使用方式：
 * ```ts
 * const log = createLogger('NostrContext')
 * log.info('初始化完成')
 * // 输出: [NostrContext] 初始化完成
 * ```
 */
export function createLogger(tag: string) {
  return {
    debug: (message: string) => logger.debug(`[${tag}] ${message}`),
    info: (message: string) => logger.info(`[${tag}] ${message}`),
    warn: (message: string) => logger.warn(`[${tag}] ${message}`),
    error: (message: string, error?: unknown) => {
      const msg = error ? `${message}: ${error}` : message
      logger.error(`[${tag}] ${msg}`)
    },
  }
}