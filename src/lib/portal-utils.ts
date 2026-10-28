import { computeOrderTrackingStep } from '@/lib/portal-auth'

const DEFAULT_GCS_BASE = 'https://storage.googleapis.com/tls-images-test'

export function parseImageArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    let parsed = JSON.parse(raw)
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        // keep as string
      }
    }
    const list: string[] = Array.isArray(parsed) ? parsed : [parsed]
    return list
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      .map(u => {
        const clean = u.trim().replace(/^["'\\]+|["'\\]+$/g, '')
        if (!clean.startsWith('http') && !clean.startsWith('/') && !clean.startsWith('data:')) {
          return `${DEFAULT_GCS_BASE}/${clean}`
        }
        return clean
      })
  } catch {
    const clean = String(raw).trim().replace(/^["'\\]+|["'\\]+$/g, '')
    if (!clean) return []
    if (!clean.startsWith('http') && !clean.startsWith('/') && !clean.startsWith('data:')) {
      return [`${DEFAULT_GCS_BASE}/${clean}`]
    }
    return [clean]
  }
}

export function formatPortalOrder(job: any) {
  let items: any[] = []
  try {
    if (job.itemsJson) {
      const parsed = JSON.parse(job.itemsJson)
      if (Array.isArray(parsed)) {
        items = parsed.map((item: any, idx: number) => ({
          id: item.id || `item-${idx}`,
          name: item.name || item.serviceName || 'Laundry Service',
          category: item.category || item.laundryType || 'General',
          quantity: Number(item.quantity ?? item.qty ?? 1),
          price: Number(item.price ?? item.unitPrice ?? 0),
          total: Number(item.total ?? (Number(item.quantity ?? item.qty ?? 1) * Number(item.price ?? item.unitPrice ?? 0))),
          note: item.note || item.remark || null
        }))
      }
    }
  } catch {}

  const allBillUrls = parseImageArray(job.billImageUrl)
  const proformaUrls = allBillUrls.filter(u => u.toLowerCase().includes('proforma-'))
  const receiptUrls = allBillUrls.filter(u => u.toLowerCase().includes('receipt-'))
  const paymentSlipUrls = allBillUrls.filter(
    u => !u.toLowerCase().includes('proforma-') && !u.toLowerCase().includes('receipt-')
  )

  const bagImageUrls = parseImageArray(job.bagImageUrl)
  const pickupProofUrls = parseImageArray(job.pickupProofImageUrl || job.proofImageUrl)
  const deliveryProofUrls = parseImageArray(job.deliveryProofImageUrl)

  const tracking = computeOrderTrackingStep(job)
  const isPaid = Boolean(job.isPaid || job.isShopPaid)
  const totalAmount = Number(job.totalAmount || 0)
  const deliveryFee = Number(job.fee || 0)
  const discount = Number(job.discount || 0)
  const itemsSubtotal = items.reduce((sum, i) => sum + i.total, 0)

  const isActive =
    tracking.stageKey !== 'delivered' &&
    tracking.stageKey !== 'cancelled'

  return {
    id: job.id,
    billNo: job.billNo || job.proformaNumber || `ORD-${job.id.slice(0, 6).toUpperCase()}`,
    proformaNumber: job.proformaNumber || null,
    brand: job.brand || 'that_laundry_shop',
    status: job.status,
    subStatus: job.subStatus || null,
    serviceType: job.serviceType || job.laundryTypes || 'Standard Laundry',
    isActive,
    tracking,
    customerName: job.customerName,
    customerPhone: job.customerPhone,
    pickupLocation: job.pickupLocation,
    dropoffLocation: job.dropoffLocation,
    scheduledAt: job.scheduledAt,
    pickupScheduledAt: job.pickupScheduledAt || job.scheduledAt,
    deliveryScheduledAt: job.deliveryScheduledAt || null,
    completedAt: job.completedAt || null,
    items,
    itemsCount: items.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0),
    itemsSubtotal,
    deliveryFee,
    discount,
    totalAmount,
    isPaid,
    paymentMethod: job.paymentMethod || null,
    paymentChannel: job.paymentChannel || null,
    paidAt: job.shopPaidAt || job.csoPaidAt || (isPaid ? job.completedAt || job.updatedAt : null),
    remark: job.remark || null,
    proformaUrls,
    receiptUrls,
    paymentSlipUrls,
    bagImageUrls,
    pickupProofUrls,
    deliveryProofUrls,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  }
}
