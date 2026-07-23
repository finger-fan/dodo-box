'use client'

// 诊断埋点(临时):捕获聊天页渲染阶段的异常并记录日志。
// 渲染异常无法用 try/catch 捕获,必须走 error boundary。
import { useEffect } from 'react'
import ErrorView from '@/components/ui/ErrorView'
import { createLogger } from '@/lib/logger'

const log = createLogger('ChatErrorBoundary')

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    log.error(
      `Chat route render error: ${error.message}\nstack: ${error.stack ?? 'n/a'}\ndigest: ${error.digest ?? 'n/a'}`
    )
  }, [error])

  return <ErrorView error={error} reset={reset} fullScreen label="ChatErrorBoundary" />
}
