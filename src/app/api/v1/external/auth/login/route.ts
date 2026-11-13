import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, generateCustomerToken, verifyServiceApiKey } from '@/lib/external-api-auth'
import { checkRateLimit, resetRateLimit, getRequestClientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    if (!verifyServiceApiKey(req)) {
      return NextResponse.json({ error: 'Unauthorized API key' }, { status: 401 })
    }

    const clientIp = getRequestClientIp(req)
    const ipLimit = checkRateLimit(`ext-login:ip:${clientIp}`, 25, 15 * 60 * 1000)
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } }
      )
    }

    const body = await req.json()
    const { identifier, login, phone, email, password, brand = 'noname_laundry' } = body

    const userIdentifier = String(identifier || login || phone || email || '').trim()
    if (!userIdentifier || !password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Phone/Email and Password are required' }, { status: 400 })
    }

    const acctLimit = checkRateLimit(`ext-login:acct:${brand}:${userIdentifier.toLowerCase()}:${clientIp}`, 10, 15 * 60 * 1000)
    if (!acctLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many failed login attempts for this account. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(acctLimit.retryAfterSeconds) } }
      )
    }

    // Find customer by brand and phone or email
    const customer = await prisma.customer.findFirst({
      where: {
        brand,
        OR: [
          { phone: userIdentifier },
          { email: userIdentifier.toLowerCase() }
        ]
      },
      include: {
        addresses: {
          orderBy: { isPrimary: 'desc' }
        }
      }
    })

    if (!customer || !customer.passwordHash) {
      return NextResponse.json({ error: 'Invalid phone/email or password' }, { status: 401 })
    }

    const isValid = verifyPassword(password, customer.passwordHash)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid phone/email or password' }, { status: 401 })
    }

    resetRateLimit(`ext-login:acct:${brand}:${userIdentifier.toLowerCase()}:${clientIp}`)

    const token = generateCustomerToken({
      customerId: customer.id,
      brand: customer.brand,
      phone: customer.phone,
      email: customer.email
    })

    return NextResponse.json({
      success: true,
      message: 'Login successful',
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        nickName: customer.nickName,
        phone: customer.phone,
        email: customer.email,
        brand: customer.brand,
        tier: customer.tier,
        isVIP: customer.isVIP,
        isMember: customer.isMember,
        creditBalance: customer.creditBalance,
        addresses: customer.addresses
      }
    })
  } catch (err: any) {
    console.error('Login API error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
