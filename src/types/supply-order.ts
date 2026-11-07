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
}

export interface SupplyOrderItem {
  id: string;
  catalogItemId?: string;
  name: string;
  nameTh?: string;
  category: SupplyItemCategory;
  quantity: number;
  unit: string;
  estimatedPrice?: number;
  notes?: string;
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
  notes?: string;
  status: SupplyOrderStatus;
  adminNotes?: string;
  vendorName?: string;
  vendorPoNumber?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: string;
  processedBy?: string;
  processedByName?: string;
  processedAt?: string;
  dispatchedAt?: string;
  completedAt?: string;
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
