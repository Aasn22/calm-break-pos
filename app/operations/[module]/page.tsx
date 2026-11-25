import { notFound } from 'next/navigation'
import Workspace from '../workspace/page'
import { operationsSections } from '@/lib/operations-modules'
export const dynamic = 'force-dynamic'
export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>
}) {
  const { module } = await params
  if (
    !operationsSections.includes(module as (typeof operationsSections)[number])
  )
    notFound()
  return <Workspace searchParams={Promise.resolve({ section: module })} />
}
