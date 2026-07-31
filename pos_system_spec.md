# Point of Sale (POS) System Specification: TLC Laundry Service

This document provides a comprehensive specification of the Point of Sale (POS) module from the **TLC Laundry Service** project. You can share this guide with another team or import it into another project to replicate this identical POS architecture.

---

## 1. System Features & User Workflows

The POS module is designed for physical laundry shop outlets. It includes the following features:

### A. Cashier Shift Management (Shift Drawer)
- **Starting Cash Drawer**: Cashiers must declare starting cash before they can perform any sales operations.
- **Real-Time Reconciliation**: The system calculates expected cash based on cash sales.
- **Close Drawer Audit**: Cashiers input the actual cash at the end of the shift. The system automatically computes and flags shortages or overages.

### B. Customer Selection & Registration
- **Search Profile**: Quick search by customer phone number or name.
- **Walk-In Default**: Supports checking out without a profile (defaults to "Walk-In").
- **Customer Registration Dialog**: Allows cashiers to register new customers on the fly without leaving the POS page.
- **Wallet/Credit Balance**: Displays the customer's credit wallet balance. Allows paying via customer credit.

### C. Shopping Cart & Dynamic Pricing
- **Category Filter**: Services are grouped into categories (e.g., Wash & Fold, Dry Cleaning, Ironing).
- **Cart Management**: Add, subtract, or delete items. Supports custom notes/remarks per item.
- **Price Lists Matching**: The system checks if the selected customer has a custom `PriceListId`. If yes, it loads custom rates; otherwise, it defaults to standard rates.
- **Express Service**: Supports applying an "Express" multiplier (e.g., +50% or +100% price markup) dynamically.

### D. Checkout & Payment Processing
- **Multi-Payment Modes**: Supports Cash, Bank Transfer, Credit Card, and Store Credit (Wallet).
- **Partial/Paid Status**: Tracks if the job is paid (`isPaid = true`) or needs to be paid later at pick up.
- **Shift Sales Sync**: Sales are automatically logged under the cashier's active shift session.

### E. Thermal Receipt Printing
- **Format**: Structured layout designed for 80mm/58mm thermal printers.
- **Receipt Structure**: Includes Shop Header, Order Number (barcode/id), Customer Info, Itemized table with quantities, VAT (if applicable), Discounts, Cashier Name, and Thank You Footer.

---

## 2. Database Schema (Prisma Models)

To support this POS system, the target database must implement the following Prisma models:

```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String   // Shop Name
  plan      String   @default("standard") // "standard" | "premium"
  taxId     String?  // Shop Tax ID for receipts
  logoUrl   String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  customers Customer[]
  jobs      Job[]
  services  ServiceItem[]
  shifts    CashierShift[]
}

model Customer {
  id            String   @id @default(uuid())
  tenantId      String
  name          String   // Customer name
  phone         String   // Customer phone number
  creditBalance Float    @default(0) // Prepaid wallet balance
  priceListId   String?  // Optional custom pricing sheet ID
  createdAt     DateTime @default(now())

  tenant        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  jobs          Job[]
}

model Job {
  id              String    @id @default(uuid())
  tenantId        String
  type            String    @default("pos") // "pos" | "pickup" | "delivery"
  customerId      String?
  customerName    String?
  customerPhone   String?
  pickupLocation  String    @default("POS Counter")
  dropoffLocation String    // Outlet name
  status          String    @default("received") // "received", "washing", "ready", "completed", "cancelled"
  createdAt       DateTime  @default(now())
  completedAt     DateTime?
  
  // Cart Items JSON representation
  // Format: Array of { name: string, quantity: number, price: number }
  itemsJson       String?   
  
  totalAmount     Float?    // Total amount charged
  paymentMethod   String?   // "cash" | "transfer" | "credit" | "card"
  isPaid          Boolean   @default(false)
  discount        Float?    @default(0)
  createdBy       String?   // Cashier Name/ID
  remark          String?   // Order note (includes tax / express markup labels)

  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  customer        Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
}

model ServiceItem {
  id        String  @id @default(uuid())
  tenantId  String
  name      String  // Service name in local language
  nameEn    String? // Service name in English
  price     Float   // Default price
  category  String  // e.g. "wash_fold", "dry_clean", "iron"
  isActive  Boolean @default(true)

  tenant    Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model PriceList {
  id            String  @id @default(uuid())
  tenantId      String
  name          String  // e.g. "Gold Member Prices"
  isDefault     Boolean @default(false)
  
  // Mapping of ServiceItem.id to custom Price
  // Format: JSON string representing Record<string, number>
  servicePrices String  

  tenant        Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model CashierShift {
  id              String    @id @default(uuid())
  tenantId        String
  userId          String    // Cashier user ID
  userName        String    // Cashier name
  openedAt        DateTime  @default(now())
  closedAt        DateTime?
  startingCash    Float     // Cash in drawer at start
  expectedCash    Float     @default(0) // Calculated startingCash + cashSales
  actualCash      Float?    // Cash declared by cashier on close
  cashSales       Float     @default(0) // Total cash sales
  transferSales   Float     @default(0) // Total bank transfer sales
  cardSales       Float     @default(0) // Total credit card sales
  creditSales     Float     @default(0) // Total store credit sales
  shortageOverage Float?    // calculated actualCash - expectedCash
  status          String    @default("open") // "open" | "closed"
  notes           String?

  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

---

## 3. Core API Endpoints & Payloads

To replicate the POS server operations, implement the following endpoints:

### A. Open Cashier Shift
- **Endpoint**: `POST /api/shifts/open`
- **Request Payload**:
  ```json
  {
    "startingCash": 1000.00
  }
  ```
- **Action**: Verifies no other shift is currently open for this user. Creates a new `CashierShift` with status `"open"`.

### B. Close Cashier Shift
- **Endpoint**: `POST /api/shifts/close`
- **Request Payload**:
  ```json
  {
    "shiftId": "uuid-here",
    "actualCash": 1250.00,
    "notes": "Closed shift drawer normally"
  }
  ```
- **Action**: Sums up all sales transactions made during the shift, compares the expected cash with the cashier's inputted `actualCash`, registers the difference as `shortageOverage`, and sets status to `"closed"`.

### C. Create POS Job (Checkout)
- **Endpoint**: `POST /api/jobs/create`
- **Request Payload**:
  ```json
  {
    "type": "pos",
    "customerId": "customer-uuid-or-null",
    "customerName": "John Doe",
    "customerPhone": "+66 812345678",
    "dropoffLocation": "Main Outlet",
    "itemsJson": "[{\"name\":\"Wash & Fold (kg)\",\"quantity\":3,\"price\":50}]",
    "totalAmount": 150.00,
    "paymentMethod": "cash",
    "isPaid": true,
    "discount": 0.00,
    "remark": "Express 50%"
  }
  ```
- **Action**:
  1. Inserts a new `Job` record.
  2. If `paymentMethod` is `"cash"`, increments the active shift's `cashSales` and `expectedCash`.
  3. If `paymentMethod` is `"credit"`, decrements the customer's `creditBalance`.

---

## 4. Porting and Frontend Integration Guide

To port the UI into a new Next.js or React application:

1. **Copy UI Components**:
   - Copy [admin-pos.tsx](file:///d:/Antigravity/TLC/TLC%20LAUNDRY%20SERVICE/src/components/admin-pos.tsx) into your component directory.
   - Ensure you have the `AdminCustomerDialog` (for creating customers) and `ThermalReceiptDialog` (for print outputs) ported.
2. **Install Required NPM Dependencies**:
   ```bash
   npm install lucide-react framer-motion date-fns sonner clsx tailwind-merge
   ```
3. **Tailwind Configurations**:
   Ensure Shadcn UI / Tailwind setup matches, particularly for:
   - `Button`, `Input`, `Label`, `Badge`, `Dialog` (Shadcn primitives).
4. **State Management**:
   The frontend POS reads state via stores in [store.ts](file:///d:/Antigravity/TLC/TLC%20LAUNDRY%20SERVICE/src/lib/store.ts) (which fetches data from the database using hooks/actions). Port the Zustand or context store models to feed database tables (`ServiceItem`, `Customer`, `CashierShift`) into the React state.
