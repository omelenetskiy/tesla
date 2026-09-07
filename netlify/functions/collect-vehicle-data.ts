const handler = async () => {
  const siteUrl = process.env.URL
  const secret = process.env.COLLECTION_CRON_SECRET
  if (!siteUrl || !secret) return new Response('Collection environment is not configured', { status: 500 })

  const response = await fetch(`${siteUrl}/api/collect`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
  return new Response(await response.text(), {
    status: response.status,
    headers: { 'content-type': 'application/json' },
  })
}

export default handler

export const config = {
  schedule: '*/15 * * * *',
}
