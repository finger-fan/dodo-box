'use client'

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export default function ErrorView({
  error,
  reset,
  fullScreen = false,
  label = 'ErrorBoundary',
}: {
  error: Error & { digest?: string }
  reset: () => void
  fullScreen?: boolean
  label?: string
}) {
  const { t } = useTranslation()

  useEffect(() => {
    console.error(`[${label}]`, error)
  }, [error, label])

  return (
    <div className={`flex flex-col items-center justify-center gap-4 p-4 ${fullScreen ? 'min-h-screen' : 'flex-1'}`}>
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
