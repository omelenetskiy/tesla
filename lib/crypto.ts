import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function getKey() {
  const secret = process.env.TESLA_TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('TESLA_TOKEN_ENCRYPTION_KEY is not configured')
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.')
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Stored Tesla token is malformed')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')
}
