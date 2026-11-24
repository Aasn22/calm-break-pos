export function hostAllowed(host: string, surface: 'customer' | 'operations') {
  const customer = process.env.CUSTOMER_HOST?.toLowerCase()
  const operations = process.env.OPERATIONS_HOST?.toLowerCase()
  // Until both names are assigned, use separate paths with the same role checks.
  if (!customer && !operations) return true
  if (!customer || !operations || customer === operations) return false
  return host.toLowerCase() === (surface === 'customer' ? customer : operations)
}
