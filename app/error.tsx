'use client'

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useTranslation()

  useEffect(() => {
    console.error('[ErrorBoundary]', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h2 className="text-xl font-semibold">{t('error.title', 'Something went wrong')}</h2>
      <p className="text-muted-foreground text-center text-sm">
        {t('error.description', 'An unexpected error occurred. Please try again.')}
      </p>
      <button
        onClick={reset}
        className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
      >
        {t('error.retry', 'Try again')}
      </button>
    </div>
  )
}
