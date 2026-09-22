import crypto from 'crypto'

const JWT_SECRET = process.env.EXTERNAL_JWT_SECRET || 'tls-noname-external-secret-key-2026'
const API_KEY = process.env.EXTERNAL_API_KEY || 'nl_api_key_live_9988776655'

/**
 * Hash a customer password using PBKDF2 / Salt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

/**
 * Verify a plaintext password against a stored salt:hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, originalHash] = storedHash.split(':')
    if (!salt || !originalHash) return false
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'))
  } catch {
    return false
  }
}

/**
 * Generate a signed session token for authenticated customers
 */
export function generateCustomerToken(payload: {
  customerId: string
  brand: string
  phone?: string | null
  email?: string | null
}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 days
    })
  ).toString('base64url')

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url')

  return `${header}.${body}.${signature}`
}

/**
 * Verify customer session token from Authorization: Bearer <token>
 */
export function verifyCustomerToken(tokenString: string): {
  customerId: string
  brand: string
  phone?: string | null
  email?: string | null
} | null {
  try {
    const parts = tokenString.replace(/^Bearer\s+/i, '').trim().split('.')
    if (parts.length !== 3) return null
    const [header, body, signature] = parts

    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url')

    if (expectedSig !== signature) return null

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null // Expired
    }

    return {
      customerId: payload.customerId,
      brand: payload.brand,
      phone: payload.phone,
      email: payload.email
    }
  } catch {
    return null
  }
}

/**
 * Verify Service-to-Service API Key from Web Server
 */
export function verifyServiceApiKey(req: Request): boolean {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('X-API-KEY')
  if (apiKey && apiKey === API_KEY) return true
  // Allow if in development environment when no key is explicitly passed
  if (process.env.NODE_ENV === 'development' && !apiKey) return true
  return false
}

/**
 * Verify Beam Checkout HMAC-SHA256 webhook signature
 */
export function verifyBeamWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string = process.env.BEAM_WEBHOOK_SECRET || 'beam_sec_live_test_123'
): boolean {
  if (!signatureHeader) return false
  try {
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, 'utf8'),
      Buffer.from(signatureHeader.trim(), 'utf8')
    )
  } catch {
    return false
  }
}
