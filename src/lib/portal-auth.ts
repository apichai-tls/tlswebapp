import crypto from 'crypto'
import { hashPassword, verifyPassword } from '@/lib/external-api-auth'
import { assertSessionSecretConfigured, verifyStaffSessionToken } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

export { hashPassword, verifyPassword }

export interface PortalTokenPayload {
  customerId: string
  brand: string
  phone?: string | null
  email?: string | null
}

function getPortalJwtSecret(): string {
  const extSecret = process.env.EXTERNAL_JWT_SECRET
  if (extSecret && extSecret.trim().length >= 16) {
    return extSecret.trim()
  }
  return assertSessionSecretConfigured()
}

export function generatePortalToken(payload: PortalTokenPayload): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const nowSec = Math.floor(Date.now() / 1000)
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: nowSec,
      exp: nowSec + 30 * 24 * 60 * 60 // 30 days
    })
  ).toString('base64url')

  const signature = crypto
    .createHmac('sha256', getPortalJwtSecret())
    .update(`${header}.${body}`)
    .digest('base64url')

  return `${header}.${body}.${signature}`
}

export function verifyPortalToken(tokenString: string): PortalTokenPayload | null {
  try {
    const parts = tokenString.replace(/^Bearer\s+/i, '').trim().split('.')
    if (parts.length !== 3) return null
    const [header, body, signature] = parts

    const expectedSig = crypto
      .createHmac('sha256', getPortalJwtSecret())
      .update(`${header}.${body}`)
      .digest('base64url')

    if (expectedSig.length !== signature.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) return null

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'))
    const nowSec = Math.floor(Date.now() / 1000)
    const maxTtlSec = 30 * 24 * 60 * 60
    if (
      !payload ||
      !payload.customerId ||
      typeof payload.iat !== 'number' ||
      !Number.isFinite(payload.iat) ||
      payload.iat <= 0 ||
      payload.iat > nowSec + 60 ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > maxTtlSec ||
      payload.exp < nowSec
    ) {
      return null
    }

    return {
      customerId: payload.customerId,
      brand: payload.brand || 'that_laundry_shop',
      phone: payload.phone || null,
      email: payload.email || null
    }
  } catch {
    return null
  }
}

export function resolvePortalCustomer(req: Request): PortalTokenPayload | null {
  const authHeader = req.headers.get('authorization')
  if (authHeader) {
    const verified = verifyPortalToken(authHeader)
    if (verified) return verified
  }

  const cookieHeader = req.headers.get('cookie')
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('tls_customer_token='))
    if (match) {
      const tokenVal = decodeURIComponent(match.slice('tls_customer_token='.length).trim())
      const verified = verifyPortalToken(tokenVal)
      if (verified) return verified
    }
  }

  return null
}

/**
 * Generates common phone format variants (e.g. +66 925656566, +66925656566, 0925656566, 092-565-6566)
 * so expat & local customers can log in regardless of spaces, dashes, or country code prefix.
 */
export function normalizePhoneVariants(rawInput: string): string[] {
  const trimmed = rawInput.trim()
  if (!trimmed) return []

  const variants = new Set<string>([trimmed])
  const digitsAndPlus = trimmed.replace(/[\s\-().]/g, '')
  if (digitsAndPlus) variants.add(digitsAndPlus)

  const digitsOnly = digitsAndPlus.replace(/^\+/, '')
  if (digitsOnly) variants.add(digitsOnly)

  // Extract subscriber digits (without leading 0 or 66)
  let subscriber = ''
  if (digitsOnly.startsWith('66') && digitsOnly.length >= 10) {
    subscriber = digitsOnly.slice(2).replace(/^0+/, '')
  } else if (digitsOnly.startsWith('0') && digitsOnly.length >= 9) {
    subscriber = digitsOnly.slice(1)
  } else if (digitsOnly.length === 9 && /^[689]\d{8}$/.test(digitsOnly)) {
    subscriber = digitsOnly
  }

  if (subscriber) {
    const localZero = '0' + subscriber
    variants.add(subscriber)
    variants.add(localZero)
    variants.add(`66${subscriber}`)
    variants.add(`+66${subscriber}`)
    variants.add(`+66 ${subscriber}`)
    variants.add(`+66 0${subscriber}`)
    variants.add(`+66-${subscriber}`)
    if (localZero.length === 10) {
      variants.add(`${localZero.slice(0, 3)}-${localZero.slice(3, 6)}-${localZero.slice(6)}`)
      variants.add(`${localZero.slice(0, 3)} ${localZero.slice(3, 6)} ${localZero.slice(6)}`)
      variants.add(`+66 ${subscriber.slice(0, 2)} ${subscriber.slice(2, 5)} ${subscriber.slice(5)}`)
      variants.add(`+66 ${subscriber.slice(0, 2)}-${subscriber.slice(2, 5)}-${subscriber.slice(5)}`)
    }
  }

  return Array.from(variants)
}

/**
 * Extracts core comparable digits from a phone string for fuzzy DB matching
 */
export function extractCorePhoneDigits(rawInput: string): string {
  const digitsOnly = rawInput.replace(/\D/g, '')
  if (digitsOnly.startsWith('66') && digitsOnly.length >= 10) {
    return digitsOnly.slice(2).replace(/^0+/, '')
  }
  if (digitsOnly.startsWith('0') && digitsOnly.length >= 9) {
    return digitsOnly.slice(1)
  }
  return digitsOnly
}

export type OtpPurpose = 'first_setup' | 'register' | 'reset_password'

function normalizeIdentifierKey(identifier: string): string {
  const clean = identifier.trim().toLowerCase()
  if (clean.includes('@')) return clean
  return extractCorePhoneDigits(clean) || clean
}

function computeOtpHash(identifierKey: string, purpose: OtpPurpose, refCode: string, otpCode: string): string {
  return crypto
    .createHmac('sha256', getPortalJwtSecret())
    .update(`otp:${identifierKey}:${purpose}:${refCode}:${otpCode}`)
    .digest('hex')
}

/**
 * Generates a 6-digit OTP code, 4-char Ref code, and a signed stateless challenge token (valid 5 mins)
 */
export function generateOtpChallenge(identifier: string, purpose: OtpPurpose): {
  otpCode: string
  refCode: string
  otpToken: string
  expiresInSeconds: number
} {
  const identifierKey = normalizeIdentifierKey(identifier)
  const otpCode = String(crypto.randomInt(100000, 999999))
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let refCode = ''
  for (let i = 0; i < 4; i++) {
    refCode += chars.charAt(crypto.randomInt(0, chars.length))
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const expiresInSeconds = 5 * 60 // 5 minutes
  const exp = nowSec + expiresInSeconds
  const codeHash = computeOtpHash(identifierKey, purpose, refCode, otpCode)

  const payloadStr = Buffer.from(
    JSON.stringify({
      identifierKey,
      purpose,
      refCode,
      codeHash,
      iat: nowSec,
      exp
    })
  ).toString('base64url')

  const sig = crypto
    .createHmac('sha256', getPortalJwtSecret())
    .update(`otp_challenge.${payloadStr}`)
    .digest('base64url')

  return {
    otpCode,
    refCode,
    otpToken: `${payloadStr}.${sig}`,
    expiresInSeconds
  }
}

/**
 * Verifies a 6-digit OTP code against the signed challenge token
 */
export function verifyOtpChallenge(params: {
  otpToken: string
  identifier: string
  otpCode: string
  expectedPurpose?: OtpPurpose
}): { valid: boolean; error?: string } {
  try {
    const { otpToken, identifier, otpCode, expectedPurpose } = params
    if (!otpToken || !otpCode) {
      return { valid: false, error: 'OTP code is required' }
    }

    const parts = otpToken.trim().split('.')
    if (parts.length !== 2) {
      return { valid: false, error: 'Invalid OTP session. Please request a new OTP.' }
    }
    const [payloadStr, sig] = parts

    const expectedSig = crypto
      .createHmac('sha256', getPortalJwtSecret())
      .update(`otp_challenge.${payloadStr}`)
      .digest('base64url')

    if (expectedSig.length !== sig.length) {
      return { valid: false, error: 'Invalid OTP token signature' }
    }
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))) {
      return { valid: false, error: 'Invalid OTP token signature' }
    }

    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8'))
    const nowSec = Math.floor(Date.now() / 1000)

    if (!payload || typeof payload.exp !== 'number' || payload.exp < nowSec) {
      return { valid: false, error: 'OTP has expired (valid for 5 minutes). Please request a new code.' }
    }

    const identifierKey = normalizeIdentifierKey(identifier)
    if (payload.identifierKey !== identifierKey) {
      return { valid: false, error: 'Phone/Email does not match the OTP request' }
    }

    if (expectedPurpose && payload.purpose !== expectedPurpose) {
      return { valid: false, error: 'OTP purpose mismatch' }
    }

    const cleanCode = String(otpCode).replace(/\D/g, '').trim()
    const expectedHash = computeOtpHash(identifierKey, payload.purpose, payload.refCode, cleanCode)

    if (expectedHash.length !== String(payload.codeHash).length) {
      return { valid: false, error: 'Invalid OTP code' }
    }
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(String(payload.codeHash), 'hex')
    )

    if (!isMatch) {
      return { valid: false, error: 'Incorrect 6-digit OTP code. Please try again.' }
    }

    return { valid: true }
  } catch {
    return { valid: false, error: 'Could not verify OTP. Please request a new code.' }
  }
}

/**
 * Maps internal POS job status & subStatus into a 6-step customer-friendly tracking timeline.
 */
export function computeOrderTrackingStep(job: {
  status: string
  subStatus?: string | null
  proformaNumber?: string | null
  billNo?: string | null
  totalAmount?: number | null
  isPaid?: boolean
  isShopPaid?: boolean
  pickupProofImageUrl?: string | null
  deliveryProofImageUrl?: string | null
}): {
  currentStep: number // 1..6 (0 if cancelled)
  stageKey: 'scheduled' | 'picked_up' | 'processing' | 'ready_billed' | 'out_for_delivery' | 'delivered' | 'cancelled'
  stageLabelEn: string
  stageLabelTh: string
  stageDescEn: string
  stageDescTh: string
} {
  const st = (job.status || '').toLowerCase()
  const sub = (job.subStatus || '').toLowerCase()

  if (st === 'cancelled' || st === 'rejected' || st === 'void') {
    return {
      currentStep: 0,
      stageKey: 'cancelled',
      stageLabelEn: 'Cancelled',
      stageLabelTh: 'ยกเลิกรายการ',
      stageDescEn: 'This order has been cancelled.',
      stageDescTh: 'รายการซักผ้านี้ถูกยกเลิกแล้ว'
    }
  }

  if (st === 'completed' || st === 'delivered' || Boolean(job.deliveryProofImageUrl && st === 'completed')) {
    return {
      currentStep: 6,
      stageKey: 'delivered',
      stageLabelEn: 'Delivered',
      stageLabelTh: 'จัดส่งเรียบร้อย',
      stageDescEn: 'Your fresh laundry has been delivered.',
      stageDescTh: 'ส่งคืนผ้าสะอาดถึงมือคุณเรียบร้อยแล้ว'
    }
  }

  if (
    sub.includes('deliver') ||
    sub.includes('out_for_delivery') ||
    sub === 'returning' ||
    st === 'out_for_delivery' ||
    st === 'delivering'
  ) {
    return {
      currentStep: 5,
      stageKey: 'out_for_delivery',
      stageLabelEn: 'Out for Delivery',
      stageLabelTh: 'กำลังจัดส่งคืน',
      stageDescEn: 'Our rider is on the way to return your laundry.',
      stageDescTh: 'ไรเดอร์กำลังนำผ้าสะอาดไปส่งคืนให้คุณ'
    }
  }

  if (
    sub.includes('ready') ||
    sub.includes('qc') ||
    sub.includes('packed') ||
    Boolean(job.proformaNumber) ||
    ((job.totalAmount || 0) > 0 && st === 'in_progress')
  ) {
    return {
      currentStep: 4,
      stageKey: 'ready_billed',
      stageLabelEn: 'Quality Checked & Billed',
      stageLabelTh: 'ตรวจสอบคุณภาพ & ออกบิลแล้ว',
      stageDescEn: 'Items inspected, itemized, and ready for return.',
      stageDescTh: 'ตรวจเช็ครายการผ้าและสรุปยอดเรียบร้อย พร้อมจัดส่งคืน'
    }
  }

  if (
    st === 'in_progress' ||
    sub.includes('wash') ||
    sub.includes('dry') ||
    sub.includes('iron') ||
    sub.includes('fold') ||
    sub.includes('hub') ||
    sub.includes('process')
  ) {
    return {
      currentStep: 3,
      stageKey: 'processing',
      stageLabelEn: 'Cleaning in Progress',
      stageLabelTh: 'กำลังซัก/ดูแลผ้า',
      stageDescEn: 'Your garments are being professionally cleaned and cared for.',
      stageDescTh: 'ผ้าของคุณกำลังอยู่ในขั้นตอนการซัก อบ รีด อย่างพิถีพิถัน'
    }
  }

  if (
    sub.includes('picked') ||
    sub.includes('collected') ||
    Boolean(job.pickupProofImageUrl)
  ) {
    return {
      currentStep: 2,
      stageKey: 'picked_up',
      stageLabelEn: 'Picked Up by Rider',
      stageLabelTh: 'ไรเดอร์รับผ้าแล้ว',
      stageDescEn: 'Rider has collected your laundry bag and is heading to the hub.',
      stageDescTh: 'ไรเดอร์รับถุงผ้าแล้ว กำลังนำเข้าศูนย์ซักรีด'
    }
  }

  return {
    currentStep: 1,
    stageKey: 'scheduled',
    stageLabelEn: 'Pickup Scheduled',
    stageLabelTh: 'นัดรับผ้าแล้ว',
    stageDescEn: 'Your pickup request is scheduled and assigned to our team.',
    stageDescTh: 'รับรายการนัดหมายเข้ารับผ้าเรียบร้อยแล้ว'
  }
}


/**
 * Checks whether the Customer Portal (/portal) is publicly enabled in System Settings (`enableCustomerPortal === 'true'`).
 * Defaults to `false` (Closed / Coming Soon) when not explicitly enabled, so deploying to production keeps it hidden from the public
 * while still allowing authenticated staff or preview testers (`tls_session` cookie or `x-portal-preview: 1` / `tls_portal_preview=1`) to test.
 */
export async function checkPortalPublicAccess(req: Request): Promise<{
  portalEnabled: boolean
  isStaffPreview: boolean
  allowed: boolean
}> {
  let portalEnabled = false
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'enableCustomerPortal' }
    })
    portalEnabled = setting?.value === 'true'
  } catch {
    portalEnabled = false
  }

  if (portalEnabled) {
    return { portalEnabled: true, isStaffPreview: false, allowed: true }
  }

  let hasPreviewAccess = false
  const previewHeader = req.headers.get('x-portal-preview')
  if (previewHeader === '1' || previewHeader === 'true') {
    hasPreviewAccess = true
  }

  const cookieHeader = req.headers.get('cookie') || ''
  if (!hasPreviewAccess && cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim())
    const previewCookie = cookies.find(c => c.startsWith('tls_portal_preview='))
    if (previewCookie && previewCookie.slice('tls_portal_preview='.length).trim() === '1') {
      hasPreviewAccess = true
    }

    if (!hasPreviewAccess) {
      const staffSessionCookie = cookies.find(c => c.startsWith('tls_session='))
      if (staffSessionCookie) {
        const tokenVal = decodeURIComponent(staffSessionCookie.slice('tls_session='.length).trim())
        if (verifyStaffSessionToken(tokenVal)) {
          hasPreviewAccess = true
        }
      }
    }
  }

  return {
    portalEnabled: false,
    isStaffPreview: hasPreviewAccess,
    allowed: hasPreviewAccess
  }
}
