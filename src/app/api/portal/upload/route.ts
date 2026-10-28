import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { resolvePortalCustomer } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'])
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  try {
    const session = resolvePortalCustomer(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const subType = String(formData.get('subType') || 'bags').trim()

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Image exceeds maximum size (10MB)' }, { status: 413 })
    }

    let ext = 'jpg'
    if (file.name && file.name.includes('.')) {
      ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    } else if (file.type && file.type.includes('/')) {
      const sub = file.type.split('/')[1]?.split(';')[0]?.trim().toLowerCase() || 'jpg'
      ext = sub === 'jpeg' ? 'jpg' : sub
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Unsupported image type: .${ext}` }, { status: 400 })
    }

    const normalizedExt = ext === 'jpeg' ? 'jpg' : ext
    const safeSubType = subType === 'slips' ? 'slips' : 'bags'
    const safeCustomerPrefix = session.customerId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36)
    const filename = `${safeCustomerPrefix}-${Date.now()}.${normalizedExt}`

    const baseUploadsRoot = path.resolve(process.cwd(), 'storage', 'uploads')
    const uploadDir = path.resolve(baseUploadsRoot, 'job', safeSubType)
    const filePath = path.resolve(uploadDir, filename)

    if (!uploadDir.startsWith(baseUploadsRoot + path.sep) || !filePath.startsWith(uploadDir + path.sep)) {
      return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 })
    }

    await fs.promises.mkdir(uploadDir, { recursive: true })
    await fs.promises.writeFile(filePath, Buffer.from(bytes))

    const publicUrl = `/uploads/job/${safeSubType}/${filename}`

    return NextResponse.json({
      success: true,
      url: publicUrl,
      publicUrl
    })
  } catch (err: any) {
    console.error('Portal upload POST error:', err)
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 })
  }
}
