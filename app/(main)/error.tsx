'use client'

import ErrorView from '@/components/ui/ErrorView'

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorView error={error} reset={reset} label="MainErrorBoundary" />
}
