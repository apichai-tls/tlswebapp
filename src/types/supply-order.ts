export type SupplyOrderStatus =
  | 'pending'      // Newly submitted by branch, awaiting admin review
  | 'approved'     // Approved by admin, queued for order/dispatch
  | 'processing'   // Admin placed order with chemical vendor
  | 'dispatched'   // In transit from vendor/central warehouse to branch
  | 'completed'    // Delivered and received at branch
  | 'cancelled';   // Cancelled or rejected by admin

export type SupplyOrderPriority = 'normal' | 'urgent' | 'critical';

export type SupplyItemCategory =
  | 'chemical'     // Detergent, softener, chemical
  | 'spotting'     // Bleach, stain removers, spotters
  | 'dry_clean'    // Dry cleaning solvent & chemicals
  | 'packaging'    // Plastic bags, suit covers, wrap
  | 'hangers'      // Wire & plastic hangers, clips
  | 'store_pos'    // Thermal paper, tags, pins, markers
  | 'cleaning'     // Drum cleaner, sanitizer, maintenance
  | 'other';

export interface CatalogSupplyItem {
  id: string;
  name: string;
  nameTh: string;
  category: SupplyItemCategory;
  categoryLabel: string;
  defaultUnit: string;
  estimatedPrice: number;
  popular?: boolean;
  description?: string;
  available?: boolean; // admin can set items available or out of stock / hidden
  vendor?: string;     // preferred supplier name
  vendorId?: string;   // linked Vendor CRM ID
  lastPriceUpdatedAt?: string; // ISO date of last price update/review
  lastPriceUpdatedBy?: string; // user name who updated/confirmed the price
  nextPriceReviewAt?: string;  // ISO date (+6 months) for next CSO price review
}

export interface BranchSupplyStockEntry {
  branchId: string;
  catalogItemId: string;
  quantity: number;
  minStock: number;
  updatedAt: string;
  updatedBy?: string;
  lastNote?: string;
}

export type BranchSupplyMovementType =
  | 'receive_order' // Auto-added when SupplyOrder is completed
  | 'manual_add'    // Staff/Admin clicked +1 or added stock
  | 'usage'         // Staff/Manager clicked -1 (used in branch)
  | 'audit_adjust'; // Adjusted via Stock Count modal

export interface BranchSupplyMovement {
  id: string;
  branchId: string;
  branchName?: string;
  catalogItemId: string;
  itemName: string;
  itemNameTh?: string;
  category: SupplyItemCategory;
  unit: string;
  unitPrice: number;
  type: BranchSupplyMovementType;
  deltaQty: number; // + for received/add, - for usage
  previousQty: number;
  newQty: number;
  estimatedCostImpact: number;
  note?: string;
  orderNumber?: string;
  userId?: string;
  userName: string;
  createdAt: string;
}

export interface SupplyVendor {
  id: string;
  code: string; // e.g. "VD-001"
  name: string;
  category: SupplyItemCategory;
  contactPerson?: string;
  phone?: string;
  lineId?: string;
  email?: string;
  orderChannel?: string; // e.g. "LINE OA", "Direct Sales", "Shopee/Lazada", "Phone"
  address?: string;
  taxId?: string;
  paymentTerms?: string; // e.g. "Credit 30 Days", "Cash / Bank Transfer"
  leadTimeDays?: number;
  minOrderAmount?: number;
  bankAccount?: string;
  notes?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplyOrderItem {
  id: string;
  catalogItemId?: string;
  name: string;
  nameTh?: string;
  category: SupplyItemCategory;
  quantity: number;
  receivedQuantity?: number; // actual verified quantity received on delivery
  unit: string;
  estimatedPrice?: number;
  actualUnitPrice?: number;  // actual unit price per invoice on delivery
  notes?: string;
  receiveNote?: string;      // shortage / damage note on delivery
  imageUrl?: string;         // reference photo for custom item request
}

export interface SupplyOrder {
  id: string; // e.g. "SUP-202611-001"
  orderNumber: string;
  branchId: string;
  branchName: string;
  requesterId: string;
  requesterName: string;
  requesterEmail?: string;
  requesterPhone?: string;
  requesterRole?: string;
  priority: SupplyOrderPriority;
  neededByDate?: string;
  items: SupplyOrderItem[];
  totalItemsCount: number;
  totalEstimatedCost: number;
  actualTotalCost?: number;
  notes?: string;
  status: SupplyOrderStatus;
  adminNotes?: string;
  vendorId?: string;
  vendorName?: string;
  vendorPoNumber?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: string;
  deliveryNoteNumber?: string;
  receiptImageUrls?: string[];
  receivedByName?: string;
  receivedNotes?: string;
  pettyCashTxId?: string;
  telegramSentAt?: string;
  processedBy?: string;
  processedByName?: string;
  processedAt?: string;
  dispatchedAt?: string;
  completedAt?: string;
  stockAdded?: boolean; // prevents double adding to branch stock on completion
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplyOrderInput {
  branchId: string;
  branchName: string;
  priority: SupplyOrderPriority;
  neededByDate?: string;
  items: SupplyOrderItem[];
  notes?: string;
}

export interface SupplyRolePermissionEntry {
  canProcessOrder: boolean; // Approve, Processing, Dispatched, Completed, View All Branches
  canCreateItem: boolean;   // Access Catalog tab, Add/Edit/Delete/Toggle supply items
  canMakeOrder: boolean;    // Order from standard available catalog items
  canRequestOrder: boolean; // Request custom / out-of-catalog items (+ Custom Item / Request Order)
}

export type SupplyPermissionsMap = Record<string, SupplyRolePermissionEntry>;

export interface SupplyPermissionRoleMeta {
  role: string;
  label: string;
  labelTh: string;
  badgeColor: string;
  description: string;
}

export const SUPPLY_PERMISSION_ROLES: SupplyPermissionRoleMeta[] = [
  {
    role: 'cso',
    label: 'CSO (Customer Service Officer)',
    labelTh: 'เจ้าหน้าที่บริการลูกค้า & ประสานงาน',
    badgeColor: 'sky',
    description: 'ประสานงานรับออเดอร์ ตรวจสอบ และดำเนินการจัดส่ง (Processing Order)',
  },
  {
    role: 'marketing',
    label: 'Marketing',
    labelTh: 'ฝ่ายการตลาด',
    badgeColor: 'purple',
    description: 'สร้างและจัดการรายการสินค้า/อุปกรณ์ใน Catalog (Create Item)',
  },
  {
    role: 'manager',
    label: 'Branch Manager',
    labelTh: 'ผู้จัดการสาขา',
    badgeColor: 'emerald',
    description: 'สั่งเบิกอุปกรณ์จาก Catalog (Make Order) และขอสั่งซื้อรายการพิเศษนอก Catalog (Request Order)',
  },
  {
    role: 'staff',
    label: 'Operations Staff',
    labelTh: 'พนักงานปฏิบัติการสาขา',
    badgeColor: 'amber',
    description: 'พนักงานประจำสาขา',
  },
  {
    role: 'accounting',
    label: 'Accounting',
    labelTh: 'แผนกบัญชี',
    badgeColor: 'indigo',
    description: 'ตรวจสอบรายการสั่งซื้อและงบประมาณ',
  },
  {
    role: 'admin',
    label: 'Super Admin',
    labelTh: 'ผู้ดูแลระบบสูงสุด',
    badgeColor: 'rose',
    description: 'สิทธิ์เข้าถึงและจัดการทุกฟังก์ชันครบวงจร',
  },
];

export const DEFAULT_SUPPLY_ROLE_PERMISSIONS: SupplyPermissionsMap = {
  admin: {
    canProcessOrder: true,
    canCreateItem: true,
    canMakeOrder: true,
    canRequestOrder: true,
  },
  superadmin: {
    canProcessOrder: true,
    canCreateItem: true,
    canMakeOrder: true,
    canRequestOrder: true,
  },
  cso: {
    canProcessOrder: true,
    canCreateItem: false,
    canMakeOrder: false,
    canRequestOrder: false,
  },
  marketing: {
    canProcessOrder: false,
    canCreateItem: true,
    canMakeOrder: false,
    canRequestOrder: false,
  },
  manager: {
    canProcessOrder: false,
    canCreateItem: false,
    canMakeOrder: true,
    canRequestOrder: true,
  },
  staff: {
    canProcessOrder: false,
    canCreateItem: false,
    canMakeOrder: true,
    canRequestOrder: false,
  },
  accounting: {
    canProcessOrder: false,
    canCreateItem: false,
    canMakeOrder: false,
    canRequestOrder: false,
  },
};

export function normalizeSupplyPermissionsMap(
  raw?: Partial<SupplyPermissionsMap> | null
): SupplyPermissionsMap {
  const result: SupplyPermissionsMap = {};
  for (const [roleKey, defVal] of Object.entries(DEFAULT_SUPPLY_ROLE_PERMISSIONS)) {
    const incoming = raw?.[roleKey];
    result[roleKey] = {
      canProcessOrder: typeof incoming?.canProcessOrder === 'boolean' ? incoming.canProcessOrder : defVal.canProcessOrder,
      canCreateItem: typeof incoming?.canCreateItem === 'boolean' ? incoming.canCreateItem : defVal.canCreateItem,
      canMakeOrder: typeof incoming?.canMakeOrder === 'boolean' ? incoming.canMakeOrder : defVal.canMakeOrder,
      canRequestOrder: typeof incoming?.canRequestOrder === 'boolean' ? incoming.canRequestOrder : defVal.canRequestOrder,
    };
  }
  if (raw) {
    for (const [customRole, incoming] of Object.entries(raw)) {
      if (!result[customRole] && incoming) {
        result[customRole] = {
          canProcessOrder: Boolean(incoming.canProcessOrder),
          canCreateItem: Boolean(incoming.canCreateItem),
          canMakeOrder: Boolean(incoming.canMakeOrder),
          canRequestOrder: Boolean(incoming.canRequestOrder),
        };
      }
    }
  }
  result.superadmin = {
    canProcessOrder: true,
    canCreateItem: true,
    canMakeOrder: true,
    canRequestOrder: true,
  };
  return result;
}

export function resolveSupplyPermissionsForUser(
  user: { role?: string | null } | null | undefined,
  permissionsMap?: Partial<SupplyPermissionsMap> | null
): SupplyRolePermissionEntry {
  const role = String(user?.role || '').toLowerCase().trim();
  if (!role) {
    return {
      canProcessOrder: false,
      canCreateItem: false,
      canMakeOrder: false,
      canRequestOrder: false,
    };
  }
  if (role === 'superadmin') {
    return {
      canProcessOrder: true,
      canCreateItem: true,
      canMakeOrder: true,
      canRequestOrder: true,
    };
  }
  const normalized = normalizeSupplyPermissionsMap(permissionsMap);
  if (normalized[role]) {
    return normalized[role];
  }
  return {
    canProcessOrder: role === 'admin',
    canCreateItem: role === 'admin',
    canMakeOrder: role === 'admin',
    canRequestOrder: role === 'admin',
  };
}

export const SUPPLY_CATEGORY_LABELS: Record<SupplyItemCategory, { en: string; th: string; color: string; icon: string }> = {
  chemical: { en: 'Detergents & Softeners', th: 'น้ำยาซักและปรับผ้านุ่ม', color: 'sky', icon: '💧' },
  spotting: { en: 'Stain Removers & Bleach', th: 'น้ำยาขจัดคราบและฟอกขาว', color: 'amber', icon: '✨' },
  dry_clean: { en: 'Dry Cleaning Chemicals', th: 'น้ำยาซักแห้ง', color: 'purple', icon: '👔' },
  packaging: { en: 'Bags & Covers', th: 'ถุงและบรรจุภัณฑ์', color: 'emerald', icon: '🛍️' },
  hangers: { en: 'Hangers & Clips', th: 'ไม้แขวนและกิ๊บหนีบ', color: 'blue', icon: '🏷️' },
  store_pos: { en: 'Tags & Receipt Paper', th: 'กระดาษใบเสร็จและแท็ก', color: 'slate', icon: '🧾' },
  cleaning: { en: 'Sanitizers & Machine Care', th: 'น้ำยาทำความสะอาดและดูแลเครื่อง', color: 'teal', icon: '🧼' },
  other: { en: 'Other Supplies', th: 'อุปกรณ์อื่นๆ', color: 'slate', icon: '📦' },
};

export const PRICE_REVIEW_INTERVAL_DAYS = 180; // 6 months

export function computeNextPriceReviewDate(fromIso?: string): string {
  const base = fromIso ? new Date(fromIso) : new Date();
  const safeBase = isNaN(base.getTime()) ? new Date() : base;
  const next = new Date(safeBase.getTime() + PRICE_REVIEW_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

export function getSupplyItemPriceReviewStatus(item: CatalogSupplyItem): {
  isDue: boolean;
  isDueSoon: boolean;
  daysSinceUpdate: number;
  daysUntilDue: number;
  lastUpdatedIso: string;
  nextReviewIso: string;
} {
  const nowMs = Date.now();
  // Default fallback: if item has no lastPriceUpdatedAt, treat popular items as due or recently updated based on ID so demo is realistic
  const fallbackPastIso = item.id === 'chm-det-20l' || item.id === 'chm-sof-20l' || item.id === 'pkg-bag-clear-l'
    ? new Date(nowMs - 188 * 24 * 60 * 60 * 1000).toISOString() // 188 days ago -> OVERDUE (> 6 months)
    : item.id === 'spt-oxy-bleach-20l' || item.id === 'dry-solvent-20l'
    ? new Date(nowMs - 168 * 24 * 60 * 60 * 1000).toISOString() // 168 days ago -> DUE SOON (in 12 days)
    : new Date(nowMs - 45 * 24 * 60 * 60 * 1000).toISOString(); // 45 days ago -> Up to date

  const lastUpdatedIso = item.lastPriceUpdatedAt || fallbackPastIso;
  const lastMs = new Date(lastUpdatedIso).getTime();
  const safeLastMs = isNaN(lastMs) ? nowMs : lastMs;

  const nextReviewIso = item.nextPriceReviewAt || new Date(safeLastMs + PRICE_REVIEW_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const nextMs = new Date(nextReviewIso).getTime();
  const safeNextMs = isNaN(nextMs) ? safeLastMs + PRICE_REVIEW_INTERVAL_DAYS * 24 * 60 * 60 * 1000 : nextMs;

  const daysSinceUpdate = Math.max(0, Math.floor((nowMs - safeLastMs) / (24 * 60 * 60 * 1000)));
  const daysUntilDue = Math.ceil((safeNextMs - nowMs) / (24 * 60 * 60 * 1000));
  const isDue = daysUntilDue <= 0;
  const isDueSoon = !isDue && daysUntilDue <= 15;

  return {
    isDue,
    isDueSoon,
    daysSinceUpdate,
    daysUntilDue,
    lastUpdatedIso,
    nextReviewIso,
  };
}

export const DEFAULT_SUPPLY_VENDORS: SupplyVendor[] = [
  {
    id: 'vnd-chem-ecolab',
    code: 'VD-001',
    name: 'Ecolab / Professional Laundry Chemicals Co., Ltd.',
    category: 'chemical',
    contactPerson: 'คุณสมชาย (ฝ่ายขายอุตสาหกรรมซักรีด)',
    phone: '02-123-4567',
    lineId: '@ecolab-thailand',
    email: 'orders.th@ecolab-laundry.com',
    orderChannel: 'LINE OA',
    address: '999 อาคารสำนักงานใหญ่ ถ.พระราม 9 เขตห้วยขวาง กรุงเทพฯ 10310',
    taxId: '0105548019283',
    paymentTerms: 'Credit 30 Days',
    leadTimeDays: 3,
    minOrderAmount: 3000,
    bankAccount: 'KBANK 045-2-99881-0 (บจก. อีโคแล็บ เคมิคอล)',
    notes: 'ผู้จำหน่ายน้ำยาซักผ้าสูตรเข้มข้น 20L, น้ำยาปรับผ้านุ่ม และน้ำยาขจัดคราบหลักของทุกสาขา ส่งฟรีเมื่อสั่งครบ 3,000 บาท',
    isActive: true,
    createdAt: '2026-01-15T08:00:00.000Z',
    updatedAt: '2026-10-01T09:30:00.000Z',
  },
  {
    id: 'vnd-dryclean-kreussler',
    code: 'VD-002',
    name: 'Thai Dry Clean & Spotting Supply (Kreussler Agent)',
    category: 'dry_clean',
    contactPerson: 'คุณวิภาดา (ผู้เชี่ยวชาญเคมีซักแห้ง)',
    phone: '081-890-2345',
    lineId: '@thaidryclean',
    email: 'sales@thaidryclean.co.th',
    orderChannel: 'Direct Sales',
    address: '142 ซอยพัฒนาการ 20 แขวงสวนหลวง เขตสวนหลวง กรุงเทพฯ 10250',
    taxId: '0105552091827',
    paymentTerms: 'Credit 30 Days',
    leadTimeDays: 2,
    minOrderAmount: 2500,
    bankAccount: 'SCB 112-3-44556-7 (บจก. ไทยดรายคลีน ซัพพลาย)',
    notes: 'จำหน่ายน้ำยาซักแห้ง Hydrocarbon, สบู่ซักแห้ง และน้ำยาขจัดคราบเฉพาะจุด (เลือด/หมึก/ไวน์)',
    isActive: true,
    createdAt: '2026-02-01T08:00:00.000Z',
    updatedAt: '2026-09-20T10:15:00.000Z',
  },
  {
    id: 'vnd-pkg-siamplast',
    code: 'VD-003',
    name: 'Siam Poly Pack & Hangers Co., Ltd. (สยามโพลีแพ็ค แอนด์ แฮงเกอร์)',
    category: 'packaging',
    contactPerson: 'คุณกิตติพงศ์ (เฮียตี๋)',
    phone: '089-456-7890',
    lineId: '@siampolypack',
    email: 'contact@siampolypack.com',
    orderChannel: 'LINE OA',
    address: '88/12 ถ.เอกชัย ต.คอกกระบือ อ.เมือง จ.สมุทรสาคร 74000',
    taxId: '0745559001234',
    paymentTerms: 'Cash / Bank Transfer',
    leadTimeDays: 2,
    minOrderAmount: 1500,
    bankAccount: 'BBL 234-0-88991-2 (บจก. สยามโพลีแพ็ค)',
    notes: 'โรงงานผลิตถุงคลุมสูท ถุงพลาสติกใส L/XL และไม้แขวนเสื้อลวดหุ้มพลาสติก/ไม้แขวนสูท',
    isActive: true,
    createdAt: '2026-02-10T08:00:00.000Z',
    updatedAt: '2026-10-12T14:00:00.000Z',
  },
  {
    id: 'vnd-pos-barcodethai',
    code: 'VD-004',
    name: 'BKK POS Paper & Hydro-Tag Supply',
    category: 'store_pos',
    contactPerson: 'คุณนภัสสร (ฝ่ายบริการลูกค้า)',
    phone: '02-778-9900',
    lineId: '@bkkpospaper',
    email: 'support@bkkpospaper.com',
    orderChannel: 'Shopee / LINE OA',
    address: '55 ถ.ลาดพร้าว แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900',
    taxId: '0105561009988',
    paymentTerms: 'Cash / Bank Transfer',
    leadTimeDays: 1,
    minOrderAmount: 500,
    bankAccount: 'KBANK 789-2-11223-4 (บจก. บีเคเค พีโอเอส เปเปอร์)',
    notes: 'กระดาษความร้อน 80x80mm, แท็กเบอร์กันน้ำซักไม่เปื่อย และเข็มกลัดซ่อนปลายปลอดสนิม',
    isActive: true,
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-10-25T11:00:00.000Z',
  },
];

export const DEFAULT_SUPPLY_CATALOG: CatalogSupplyItem[] = [
  // 1. Chemicals & Detergents
  {
    id: 'chm-det-20l',
    name: 'Liquid Laundry Detergent (Commercial 20L)',
    nameTh: 'น้ำยาซักผ้าสูตรเข้มข้น แกลลอน 20 ลิตร',
    category: 'chemical',
    categoryLabel: 'Detergents & Softeners',
    defaultUnit: 'Gallon (20L)',
    estimatedPrice: 1250,
    popular: true,
    description: 'High-efficiency industrial laundry detergent, low suds formula',
    vendor: 'Ecolab / Professional Laundry Chemicals Co., Ltd.',
    vendorId: 'vnd-chem-ecolab',
  },
  {
    id: 'chm-det-5l',
    name: 'Liquid Laundry Detergent (5L)',
    nameTh: 'น้ำยาซักผ้าสูตรเข้มข้น แกลลอน 5 ลิตร',
    category: 'chemical',
    categoryLabel: 'Detergents & Softeners',
    defaultUnit: 'Gallon (5L)',
    estimatedPrice: 380,
    popular: false,
    description: 'Compact 5L container for spot washing or smaller loads',
    vendor: 'Ecolab / Professional Laundry Chemicals Co., Ltd.',
    vendorId: 'vnd-chem-ecolab',
  },
  {
    id: 'chm-sof-20l',
    name: 'Fabric Softener - Luxury Fresh (20L)',
    nameTh: 'น้ำยาปรับผ้านุ่ม กลิ่นหอมติดทน แกลลอน 20 ลิตร',
    category: 'chemical',
    categoryLabel: 'Detergents & Softeners',
    defaultUnit: 'Gallon (20L)',
    estimatedPrice: 980,
    popular: true,
    description: 'Premium floral comfort, anti-static softener',
    vendor: 'Ecolab / Professional Laundry Chemicals Co., Ltd.',
    vendorId: 'vnd-chem-ecolab',
  },
  {
    id: 'chm-sof-5l',
    name: 'Fabric Softener (5L)',
    nameTh: 'น้ำยาปรับผ้านุ่ม แกลลอน 5 ลิตร',
    category: 'chemical',
    categoryLabel: 'Detergents & Softeners',
    defaultUnit: 'Gallon (5L)',
    estimatedPrice: 290,
    popular: false,
  },

  // 2. Stain Removers & Bleach
  {
    id: 'spt-oxy-10kg',
    name: 'Color-Safe Oxygen Bleach Powder (10kg)',
    nameTh: 'ผงฟอกผ้าขาว-ผ้าสี ออกซิเจนบลีช 10 กก.',
    category: 'spotting',
    categoryLabel: 'Stain Removers & Bleach',
    defaultUnit: 'Bucket (10kg)',
    estimatedPrice: 850,
    popular: true,
    description: 'Non-chlorine color-safe brightening and sanitizing agent',
  },
  {
    id: 'spt-chlor-20l',
    name: 'Industrial Chlorine Bleach (20L)',
    nameTh: 'น้ำยาฟอกขาวคลอรีนสำหรับผ้าขาว 20 ลิตร',
    category: 'spotting',
    categoryLabel: 'Stain Removers & Bleach',
    defaultUnit: 'Gallon (20L)',
    estimatedPrice: 550,
    popular: true,
    description: 'For hospital & hotel white bed linens and towels only',
  },
  {
    id: 'spt-rust-1l',
    name: 'Rust & Iron Mineral Stain Remover (1L)',
    nameTh: 'น้ำยาขจัดคราบสนิมผ้าและคราบเหลืองน้ำประปา 1 ลิตร',
    category: 'spotting',
    categoryLabel: 'Stain Removers & Bleach',
    defaultUnit: 'Bottle (1L)',
    estimatedPrice: 420,
    popular: false,
  },
  {
    id: 'spt-collar-1l',
    name: 'Collar & Cuff Pre-Wash Spray (1L)',
    nameTh: 'สเปรย์ป้ายคอเสื้อและข้อมือขจัดคราบเหงื่อไคล 1 ลิตร',
    category: 'spotting',
    categoryLabel: 'Stain Removers & Bleach',
    defaultUnit: 'Bottle (1L)',
    estimatedPrice: 350,
    popular: true,
  },
  {
    id: 'spt-grease-1l',
    name: 'Oil, Grease & Makeup Spotter (1L)',
    nameTh: 'น้ำยาขจัดคราบน้ำมัน จาระบี และเครื่องสำอาง 1 ลิตร',
    category: 'spotting',
    categoryLabel: 'Stain Removers & Bleach',
    defaultUnit: 'Bottle (1L)',
    estimatedPrice: 480,
    popular: true,
  },

  // 3. Dry Cleaning Chemicals
  {
    id: 'dc-solv-20l',
    name: 'Eco Hydrocarbon Dry Cleaning Solvent (20L)',
    nameTh: 'น้ำยาซักแห้งไฮโดรคาร์บอน (สูตรอ่อนโยน) ถัง 20 ลิตร',
    category: 'dry_clean',
    categoryLabel: 'Dry Cleaning Chemicals',
    defaultUnit: 'Drum (20L)',
    estimatedPrice: 2850,
    popular: true,
    description: 'Odorless high-purity dry cleaning solvent for delicate garments',
  },
  {
    id: 'dc-spot-set',
    name: 'Professional Dry Clean Spotting Kit (Set of 4)',
    nameTh: 'ชุดน้ำยาป้ายคราบซักแห้งระดับมืออาชีพ 4 ชนิด',
    category: 'dry_clean',
    categoryLabel: 'Dry Cleaning Chemicals',
    defaultUnit: 'Set',
    estimatedPrice: 1650,
    popular: false,
  },

  // 4. Packaging
  {
    id: 'pkg-bag-sm',
    name: 'Laundry Bags Medium 20x30" (Roll 100 pcs)',
    nameTh: 'ถุงพลาสติกซักรีด ขนาด 20x30 นิ้ว (ม้วน 100 ใบ)',
    category: 'packaging',
    categoryLabel: 'Bags & Covers',
    defaultUnit: 'Roll (100 pcs)',
    estimatedPrice: 320,
    popular: true,
  },
  {
    id: 'pkg-bag-lg',
    name: 'Laundry Bags Large 24x36" (Roll 100 pcs)',
    nameTh: 'ถุงพลาสติกซักรีด ขนาด 24x36 นิ้ว (ม้วน 100 ใบ)',
    category: 'packaging',
    categoryLabel: 'Bags & Covers',
    defaultUnit: 'Roll (100 pcs)',
    estimatedPrice: 420,
    popular: true,
  },
  {
    id: 'pkg-duvet-bag',
    name: 'Comforter / Duvet Zipper Bags (Pack 25 pcs)',
    nameTh: 'ถุงซิปใส่ผ้านวม-ผ้านวมหนา (แพ็ค 25 ใบ)',
    category: 'packaging',
    categoryLabel: 'Bags & Covers',
    defaultUnit: 'Pack (25 pcs)',
    estimatedPrice: 490,
    popular: true,
  },
  {
    id: 'pkg-garment-cover',
    name: 'Clear Garment Poly Covers - Roll (Roll 250 pcs)',
    nameTh: 'ม้วนถุงคลุมชุดเสื้อผ้าแบบใส (ม้วน 250 ใบ)',
    category: 'packaging',
    categoryLabel: 'Bags & Covers',
    defaultUnit: 'Roll (250 pcs)',
    estimatedPrice: 650,
    popular: true,
  },

  // 5. Hangers & Clips
  {
    id: 'hng-wire-white',
    name: 'White Powder-Coated Wire Hangers (Box 500 pcs)',
    nameTh: 'ไม้แขวนเสื้อลวดเคลือบขาว (กล่อง 500 ชิ้น)',
    category: 'hangers',
    categoryLabel: 'Hangers & Clips',
    defaultUnit: 'Box (500 pcs)',
    estimatedPrice: 750,
    popular: true,
  },
  {
    id: 'hng-suit-plastic',
    name: 'Heavy Plastic Suit & Jacket Hangers (Box 100 pcs)',
    nameTh: 'ไม้แขวนสูทพลาสติกหนา สำหรับแจ็คเก็ต (กล่อง 100 ชิ้น)',
    category: 'hangers',
    categoryLabel: 'Hangers & Clips',
    defaultUnit: 'Box (100 pcs)',
    estimatedPrice: 680,
    popular: false,
  },
  {
    id: 'hng-trouser-clip',
    name: 'Trouser / Skirt Spring Clips (Pack 100 pcs)',
    nameTh: 'กิ๊บหนีบกางเกง-กระโปรง (แพ็ค 100 ชิ้น)',
    category: 'hangers',
    categoryLabel: 'Hangers & Clips',
    defaultUnit: 'Pack (100 pcs)',
    estimatedPrice: 240,
    popular: false,
  },

  // 6. Store & POS Supplies
  {
    id: 'pos-roll-80mm',
    name: 'Thermal Receipt Paper 80x80mm (Box 50 rolls)',
    nameTh: 'กระดาษความร้อนเครื่องพิมพ์ใบเสร็จ 80x80 มม. (กล่อง 50 ม้วน)',
    category: 'store_pos',
    categoryLabel: 'Tags & Receipt Paper',
    defaultUnit: 'Box (50 rolls)',
    estimatedPrice: 850,
    popular: true,
  },
  {
    id: 'pos-tags-waterproof',
    name: 'Waterproof Laundry Number Tag Strips (Pack 1000)',
    nameTh: 'กระดาษแท็กเบอร์กันน้ำ สำหรับแยกผ้า (แพ็ค 1000 แผ่น)',
    category: 'store_pos',
    categoryLabel: 'Tags & Receipt Paper',
    defaultUnit: 'Pack (1000)',
    estimatedPrice: 380,
    popular: true,
  },
  {
    id: 'pos-pins-brass',
    name: 'Safety Pins Brass Rust-Free (Box 1000 pcs)',
    nameTh: 'เข็มกลัดซ่อนปลาย ปลอดสนิม (กล่อง 1000 ตัว)',
    category: 'store_pos',
    categoryLabel: 'Tags & Receipt Paper',
    defaultUnit: 'Box (1000 pcs)',
    estimatedPrice: 220,
    popular: true,
  },

  // 7. Cleaning & Maintenance
  {
    id: 'cln-drum-cleaner',
    name: 'Washing Machine Drum Descaler & Cleaner (Box 24 tabs)',
    nameTh: 'ก้อนล้างถังซักและขจัดคราบหินปูน (กล่อง 24 ก้อน)',
    category: 'cleaning',
    categoryLabel: 'Sanitizers & Machine Care',
    defaultUnit: 'Box (24 tabs)',
    estimatedPrice: 360,
    popular: true,
  },
  {
    id: 'cln-sanitizer-5l',
    name: 'Multi-Surface Disinfectant & Iron Cleaner (5L)',
    nameTh: 'น้ำยาฆ่าเชื้อทำความสะอาดพื้นผิวและเตารีด แกลลอน 5 ลิตร',
    category: 'cleaning',
    categoryLabel: 'Sanitizers & Machine Care',
    defaultUnit: 'Gallon (5L)',
    estimatedPrice: 450,
    popular: false,
  },
  {
    id: 'cln-gloves-nitrile',
    name: 'Nitrile Heavy-Duty Work Gloves - Size L (Box 100 pcs)',
    nameTh: 'ถุงมือยางไนไตรสำหรับคัดแยกผ้าและจับสารเคมี (กล่อง 100 ชิ้น)',
    category: 'cleaning',
    categoryLabel: 'Sanitizers & Machine Care',
    defaultUnit: 'Box (100 pcs)',
    estimatedPrice: 260,
    popular: true,
  },
];
