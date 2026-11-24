import type { Metadata } from 'next'
import Portal from '@/components/portal'
export const metadata: Metadata = {
  title: 'Calm Break Operations',
  robots: { index: false, follow: false },
}
export default function OperationsPage() {
  return <Portal surface="operations" />
}
