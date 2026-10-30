import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  generatePortalToken,
  hashPassword,
  verifyPassword,
  resolvePortalCustomer,
  normalizePhoneVariants,
  extractCorePhoneDigits,
  generateOtpChallenge,
  verifyOtpChallenge,
  checkPortalPublicAccess,
  type OtpPurpose
} from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts
    .map((p, idx) => {
      if (idx === 0) return p
      return p.charAt(0) + '***'
    })
    .join(' ')
}

async function dispatchOtpMessage(identifier: string, otpCode: string, refCode: string) {
  console.log(`[Portal OTP] To: ${identifier} | OTP: ${otpCode} (Ref: ${refCode})`)
  // Ready for webhook / SMS provider (ThaiBulkSMS / Twilio) if configured in .env
  const webhookUrl = process.env.PORTAL_OTP_WEBHOOK_URL
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: identifier,
          otpCode,
          refCode,
          message: `Your That Laundry Shop verification code is ${otpCode} (Ref: ${refCode}). Valid for 5 minutes.`
        })
      })
      return { deliveredExternal: true }
    } catch (e) {
      console.warn('[Portal OTP] External webhook failed, falling back to demo display:', e)
    }
  }
  return { deliveredExternal: false }
}

async function findCustomerByIdentifier(identifier: string, preferredBrand?: string) {
  const clean = identifier.trim()
  if (!clean) return null

  const isEmail = clean.includes('@')
  const phoneVariants = isEmail ? [] : normalizePhoneVariants(clean)
  const coreDigits = isEmail ? '' : extractCorePhoneDigits(clean)

  const orConditions: any[] = []
  if (isEmail) {
    orConditions.push({ email: { equals: clean, mode: 'insensitive' } })
  } else {
    orConditions.push({ phone: { in: phoneVariants } })
    orConditions.push({ secondaryPhone: { in: phoneVariants } })
    orConditions.push({ whatsappId: { in: phoneVariants } })
    if (coreDigits.length >= 7) {
      orConditions.push({ phone: { contains: coreDigits } })
      orConditions.push({ secondaryPhone: { contains: coreDigits } })
      orConditions.push({ whatsappId: { contains: coreDigits } })
    }
  }

  const rawMatches = await prisma.customer.findMany({
    where: { OR: orConditions },
    include: {
      addresses: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
      }
    },
    orderBy: { updatedAt: 'desc' }
  })

  const matches = isEmail
    ? rawMatches
    : rawMatches.filter(m => {
        const candidates = [m.phone, m.secondaryPhone, m.whatsappId].filter(Boolean) as string[]
        return candidates.some(c => extractCorePhoneDigits(c) === coreDigits)
      })

  if (matches.length === 0) return null
  if (preferredBrand) {
    const brandMatch = matches.find(m => m.brand === preferredBrand)
    if (brandMatch) return brandMatch
  }
  return matches[0]
}

function buildAuthResponse(customer: any, token: string, message: string) {
  const response = NextResponse.json({
    success: true,
    message,
    token,
    customer: {
      id: customer.id,
      name: customer.name,
      nickName: customer.nickName,
      phone: customer.phone,
      secondaryPhone: customer.secondaryPhone,
      email: customer.email,
      lineId: customer.lineId,
      whatsappId: customer.whatsappId,
      tier: customer.tier || 'Regular',
      isMember: customer.isMember,
      memberId: customer.memberId,
      memberExpiryDate: customer.memberExpiryDate,
      isVIP: customer.isVIP,
      creditBalance: customer.creditBalance || 0,
      brand: customer.brand || 'that_laundry_shop',
      defaultAddress: customer.defaultAddress,
      roomNo: customer.roomNo,
      addresses: customer.addresses || []
    }
  })

  response.cookies.set('tls_customer_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === 'production'
  })

  return response
}

export async function GET(req: Request) {
  try {
    const access = await checkPortalPublicAccess(req)
    if (!access.allowed) {
      return NextResponse.json({
        authenticated: false,
        customer: null,
        portalEnabled: false,
        isStaffPreview: false,
        allowed: false
      })
    }

    const session = resolvePortalCustomer(req)
    if (!session) {
      return NextResponse.json({
        authenticated: false,
        customer: null,
        portalEnabled: access.portalEnabled,
        isStaffPreview: access.isStaffPreview,
        allowed: true
      })
    }

    const customer = await prisma.customer.findUnique({
      where: { id: session.customerId },
      include: {
        addresses: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }]
        }
      }
    })

    if (!customer) {
      return NextResponse.json({
        authenticated: false,
        customer: null,
        portalEnabled: access.portalEnabled,
        isStaffPreview: access.isStaffPreview,
        allowed: true
      })
    }

    return NextResponse.json({
      authenticated: true,
      portalEnabled: access.portalEnabled,
      isStaffPreview: access.isStaffPreview,
      allowed: true,
      customer: {
        id: customer.id,
        name: customer.name,
        nickName: customer.nickName,
        phone: customer.phone,
        secondaryPhone: customer.secondaryPhone,
        email: customer.email,
        lineId: customer.lineId,
        whatsappId: customer.whatsappId,
        tier: customer.tier || 'Regular',
        isMember: customer.isMember,
        memberId: customer.memberId,
        memberExpiryDate: customer.memberExpiryDate,
        isVIP: customer.isVIP,
        creditBalance: customer.creditBalance || 0,
        brand: customer.brand || 'that_laundry_shop',
        defaultAddress: customer.defaultAddress,
        roomNo: customer.roomNo,
        addresses: customer.addresses || []
      }
    })
  } catch (err: any) {
    console.error('Portal auth GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const access = await checkPortalPublicAccess(req)
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: 'Customer Portal is currently closed / Coming Soon',
          portalClosed: true
        },
        { status: 503 }
      )
    }

    const body = await req.json()
    const { action = 'login', identifier, password, brand, otpToken, otpCode } = body

    // 1. Check account existence & auto-send OTP if first-time setup or new registration
    if (action === 'check_account') {
      if (!identifier || !String(identifier).trim()) {
        return NextResponse.json({ error: 'Please enter your phone number or email' }, { status: 400 })
      }
      const cleanId = String(identifier).trim()
      const customer = await findCustomerByIdentifier(cleanId, brand)

      // Brand-new customer -> send OTP for registration
      if (!customer) {
        const challenge = generateOtpChallenge(cleanId, 'register')
        await dispatchOtpMessage(cleanId, challenge.otpCode, challenge.refCode)

        return NextResponse.json({
          success: true,
          exists: false,
          needsPasswordSetup: false,
          otpRequired: true,
          otpToken: challenge.otpToken,
          refCode: challenge.refCode,
          expiresInSeconds: challenge.expiresInSeconds,
          demoOtpCode: challenge.otpCode
        })
      }

      // Existing POS customer without password -> send OTP for first-time setup
      if (!customer.passwordHash) {
        const challenge = generateOtpChallenge(cleanId, 'first_setup')
        await dispatchOtpMessage(cleanId, challenge.otpCode, challenge.refCode)

        return NextResponse.json({
          success: true,
          exists: true,
          needsPasswordSetup: true,
          maskedName: maskName(customer.name),
          brand: customer.brand || 'that_laundry_shop',
          otpRequired: true,
          otpToken: challenge.otpToken,
          refCode: challenge.refCode,
          expiresInSeconds: challenge.expiresInSeconds,
          demoOtpCode: challenge.otpCode
        })
      }

      // Returning customer with password -> normal password login (no OTP required)
      return NextResponse.json({
        success: true,
        exists: true,
        needsPasswordSetup: false,
        maskedName: maskName(customer.name),
        brand: customer.brand || 'that_laundry_shop',
        otpRequired: false
      })
    }

    // 2. Request / Resend OTP explicitly (for Forgot Password, Resend OTP, etc.)
    if (action === 'request_otp') {
      if (!identifier || !String(identifier).trim()) {
        return NextResponse.json({ error: 'Phone number or email is required' }, { status: 400 })
      }
      const cleanId = String(identifier).trim()
      const purpose: OtpPurpose =
        body.purpose === 'reset_password'
          ? 'reset_password'
          : body.purpose === 'register'
          ? 'register'
          : 'first_setup'

      if (purpose === 'reset_password' || purpose === 'first_setup') {
        const customer = await findCustomerByIdentifier(cleanId, brand)
        if (!customer) {
          return NextResponse.json({ error: 'Customer account not found' }, { status: 404 })
        }
      }

      const challenge = generateOtpChallenge(cleanId, purpose)
      await dispatchOtpMessage(cleanId, challenge.otpCode, challenge.refCode)

      return NextResponse.json({
        success: true,
        message: 'OTP code sent',
        purpose,
        otpToken: challenge.otpToken,
        refCode: challenge.refCode,
        expiresInSeconds: challenge.expiresInSeconds,
        demoOtpCode: challenge.otpCode
      })
    }

    // 3. Quick Track by Bill Number / Order ID + Phone Number
    if (action === 'quick_track') {
      const billOrOrderNo = String(body.billNo || '').trim()
      const phoneInput = String(identifier || body.phone || '').trim()

      if (!billOrOrderNo || !phoneInput) {
        return NextResponse.json(
          { error: 'Both Bill/Order Number and Phone Number are required' },
          { status: 400 }
        )
      }

      const phoneVariants = normalizePhoneVariants(phoneInput)

      const job = await prisma.job.findFirst({
        where: {
          OR: [
            { billNo: { equals: billOrOrderNo, mode: 'insensitive' } },
            { proformaNumber: { equals: billOrOrderNo, mode: 'insensitive' } },
            { id: billOrOrderNo }
          ]
        },
        include: {
          customer: {
            include: {
              addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] }
            }
          }
        }
      })

      if (!job) {
        return NextResponse.json(
          { error: 'Order not found. Please check your Bill No. (e.g. TLS-...)' },
          { status: 404 }
        )
      }

      const inputCore = extractCorePhoneDigits(phoneInput)
      const jobPhoneVariants = job.customerPhone ? normalizePhoneVariants(job.customerPhone) : []
      const custPhoneVariants = job.customer?.phone ? normalizePhoneVariants(job.customer.phone) : []
      const allAllowedPhones = new Set([...jobPhoneVariants, ...custPhoneVariants])
      const phoneMatches =
        phoneVariants.some(v => allAllowedPhones.has(v)) ||
        (inputCore.length >= 7 &&
          (extractCorePhoneDigits(job.customerPhone || '') === inputCore ||
            extractCorePhoneDigits(job.customer?.phone || '') === inputCore))

      if (!phoneMatches) {
        return NextResponse.json(
          { error: 'Phone number does not match this order' },
          { status: 401 }
        )
      }

      let customer = job.customer
      if (!customer && job.customerId) {
        customer = await prisma.customer.findUnique({
          where: { id: job.customerId },
          include: { addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] } }
        })
      }

      if (!customer) {
        return NextResponse.json(
          { error: 'Customer profile not linked to this order' },
          { status: 404 }
        )
      }

      const token = generatePortalToken({
        customerId: customer.id,
        brand: customer.brand || 'that_laundry_shop',
        phone: customer.phone,
        email: customer.email
      })

      const res = buildAuthResponse(customer, token, 'Order verified')
      const resJson = await res.json()
      const finalRes = NextResponse.json({
        ...resJson,
        matchedOrderId: job.id
      })
      finalRes.cookies.set('tls_customer_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
        secure: process.env.NODE_ENV === 'production'
      })
      return finalRes
    }

    // 4. First-time password setup for existing POS customers (Requires OTP verification)
    if (action === 'setup_password') {
      if (!identifier || !password || String(password).length < 4) {
        return NextResponse.json(
          { error: 'Please enter a valid PIN/Password (at least 4 characters)' },
          { status: 400 }
        )
      }

      const otpCheck = verifyOtpChallenge({
        otpToken: String(otpToken || ''),
        identifier: String(identifier),
        otpCode: String(otpCode || ''),
        expectedPurpose: 'first_setup'
      })
      if (!otpCheck.valid) {
        return NextResponse.json({ error: otpCheck.error || 'Invalid OTP code' }, { status: 401 })
      }

      const customer = await findCustomerByIdentifier(String(identifier), brand)
      if (!customer) {
        return NextResponse.json({ error: 'Customer account not found' }, { status: 404 })
      }

      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          passwordHash: hashPassword(String(password)),
          forcePasswordReset: false,
          isVerified: true,
          verifiedVia: 'portal_otp_first_setup'
        },
        include: {
          addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] }
        }
      })

      const token = generatePortalToken({
        customerId: updated.id,
        brand: updated.brand || 'that_laundry_shop',
        phone: updated.phone,
        email: updated.email
      })

      return buildAuthResponse(updated, token, 'Account verified & password set successfully')
    }

    // 5. Forgot Password / Reset PIN via OTP
    if (action === 'reset_password') {
      if (!identifier || !password || String(password).length < 4) {
        return NextResponse.json(
          { error: 'Please enter a new PIN/Password (at least 4 characters)' },
          { status: 400 }
        )
      }

      const otpCheck = verifyOtpChallenge({
        otpToken: String(otpToken || ''),
        identifier: String(identifier),
        otpCode: String(otpCode || ''),
        expectedPurpose: 'reset_password'
      })
      if (!otpCheck.valid) {
        return NextResponse.json({ error: otpCheck.error || 'Invalid OTP code' }, { status: 401 })
      }

      const customer = await findCustomerByIdentifier(String(identifier), brand)
      if (!customer) {
        return NextResponse.json({ error: 'Customer account not found' }, { status: 404 })
      }

      const updated = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          passwordHash: hashPassword(String(password)),
          forcePasswordReset: false,
          isVerified: true,
          verifiedVia: 'portal_otp_reset'
        },
        include: {
          addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] }
        }
      })

      const token = generatePortalToken({
        customerId: updated.id,
        brand: updated.brand || 'that_laundry_shop',
        phone: updated.phone,
        email: updated.email
      })

      return buildAuthResponse(updated, token, 'Password reset successfully')
    }

    // 6. Register new customer account (Requires OTP verification)
    if (action === 'register') {
      const { name, nickName, phone, email, roomNo, condoName, addressText } = body
      const cleanName = String(name || '').trim().toUpperCase()
      const cleanPhone = String(phone || identifier || '').trim()
      const cleanEmail = email ? String(email).trim().toLowerCase() : null

      if (!cleanName) {
        return NextResponse.json({ error: 'Full Name is required' }, { status: 400 })
      }
      if (!cleanPhone) {
        return NextResponse.json({ error: 'Phone / WhatsApp number is required' }, { status: 400 })
      }
      if (!password || String(password).length < 4) {
        return NextResponse.json(
          { error: 'Password / PIN must be at least 4 characters' },
          { status: 400 }
        )
      }

      const otpCheck = verifyOtpChallenge({
        otpToken: String(otpToken || ''),
        identifier: cleanPhone,
        otpCode: String(otpCode || ''),
        expectedPurpose: 'register'
      })
      if (!otpCheck.valid) {
        return NextResponse.json({ error: otpCheck.error || 'Invalid OTP code' }, { status: 401 })
      }

      const existing = await findCustomerByIdentifier(cleanPhone, brand)
      if (existing) {
        return NextResponse.json(
          { error: 'This phone number is already in our system. Please sign in instead.' },
          { status: 409 }
        )
      }

      const targetBrand = brand || 'that_laundry_shop'
      const fullAddressStr = [condoName, addressText].filter(Boolean).join(', ')

      const created = await prisma.customer.create({
        data: {
          name: cleanName,
          nickName: nickName ? String(nickName).trim() : null,
          phone: cleanPhone,
          whatsappId: cleanPhone,
          isWhatsapp: true,
          email: cleanEmail,
          passwordHash: hashPassword(String(password)),
          brand: targetBrand,
          sourceSystem: 'customer_portal',
          isVerified: true,
          verifiedVia: 'portal_otp_register',
          tier: 'Regular',
          defaultAddress: fullAddressStr || null,
          roomNo: roomNo ? String(roomNo).trim() : null,
          addresses: fullAddressStr
            ? {
                create: {
                  label: 'Home / Condo',
                  placeName: condoName ? String(condoName).trim() : null,
                  address: fullAddressStr,
                  roomNumber: roomNo ? String(roomNo).trim() : null,
                  district: 'Bangkok',
                  province: 'Bangkok',
                  contactName: cleanName,
                  contactPhone: cleanPhone,
                  leaveWithJuristic: true,
                  isPrimary: true
                }
              }
            : undefined
        },
        include: {
          addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] }
        }
      })

      const token = generatePortalToken({
        customerId: created.id,
        brand: created.brand,
        phone: created.phone,
        email: created.email
      })

      return buildAuthResponse(created, token, 'Account created successfully')
    }

    // 7. Standard Login with Phone/Email + Password/PIN
    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Phone/Email and Password are required' },
        { status: 400 }
      )
    }

    const customer = await findCustomerByIdentifier(String(identifier), brand)
    if (!customer) {
      return NextResponse.json({ error: 'Account not found. Please check your phone/email.' }, { status: 401 })
    }

    if (!customer.passwordHash) {
      return NextResponse.json(
        {
          error: 'First-time login detected. Please verify OTP & set your password.',
          needsPasswordSetup: true,
          maskedName: maskName(customer.name)
        },
        { status: 403 }
      )
    }

    const isValid = verifyPassword(String(password), customer.passwordHash)
    if (!isValid) {
      return NextResponse.json({ error: 'Incorrect password or PIN' }, { status: 401 })
    }

    const token = generatePortalToken({
      customerId: customer.id,
      brand: customer.brand || 'that_laundry_shop',
      phone: customer.phone,
      email: customer.email
    })

    return buildAuthResponse(customer, token, 'Signed in successfully')
  } catch (err: any) {
    console.error('Portal auth POST error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, message: 'Signed out' })
  response.cookies.set('tls_customer_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  })
  return response
}
