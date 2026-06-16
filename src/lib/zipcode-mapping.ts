export const ZIPCODE_TO_SHOP: Record<string, string> = {
  // === สาขา SR (Sukhumvit 15) - กรุงเทพฯ ชั้นใน/ฝั่งธน ===
  "10100": "shop-head", // ปทุมวัน / สัมพันธวงศ์ / ป้อมปราบฯ
  "10110": "shop-head", // วัฒนา (ที่ตั้งสาขา)
  "10120": "shop-head", // สาทร / ยานนาวา
  "10140": "shop-head", // ราษฎร์บูรณะ / ทุ่งครุ
  "10150": "shop-head", // บางขุนเทียน
  "10160": "shop-head", // บางแค / ภาษีเจริญ / หนองแขม
  "10170": "shop-head", // ตลิ่งชัน / ทวีวัฒนา
  "10300": "shop-head", // ดุสิต
  "10320": "shop-head", // ห้วยขวาง / ดินแดง (บางส่วน)
  "10330": "shop-head", // ปทุมวัน
  "10400": "shop-head", // พญาไท / ราชเทวี / ดินแดง
  "10500": "shop-head", // บางรัก
  "10600": "shop-head", // ธนบุรี / คลองสาน / บางกอกใหญ่
  "10700": "shop-head", // บางกอกน้อย / บางพลัด
  "10800": "shop-head", // บางซื่อ
  "10900": "shop-head", // จตุจักร

  // === สาขา PK (Pattanakarn) - กรุงเทพฯ ฝั่งตะวันออก/เหนือ ===
  "10210": "SHOP-MOGWZ0X0", // หลักสี่ / ดอนเมือง
  "10220": "SHOP-MOGWZ0X0", // บางเขน / สายไหม
  "10230": "SHOP-MOGWZ0X0", // คันนายาว / ลาดพร้าว
  "10240": "SHOP-MOGWZ0X0", // บางกะปิ / บึงกุ่ม / สะพานสูง
  "10250": "SHOP-MOGWZ0X0", // พัฒนาการ/สวนหลวง (ที่ตั้งสาขา) / ประเวศ
  "10260": "SHOP-MOGWZ0X0", // บางนา / พระโขนง
  "10310": "SHOP-MOGWZ0X0", // วังทองหลาง
  "10510": "SHOP-MOGWZ0X0", // มีนบุรี / คลองสามวา
  "10520": "SHOP-MOGWZ0X0", // ลาดกระบัง
  "10530": "SHOP-MOGWZ0X0", // หนองจอก

  // === สาขา PTY (Pattaya) - ชลบุรี ===
  "20150": "SHOP-MOLCJ2X8", // พัทยา/บางละมุง (ที่ตั้งสาขา)
  "20260": "SHOP-MOLCJ2X8", // พัทยา
  "20180": "SHOP-MOLCJ2X8", // บางละมุง
};

/**
 * Extracts 5-digit zip code from address string and maps it to a shop ID.
 * Returns null if no match is found.
 */
export function getShopIdByZipCode(address: string): string | null {
  if (!address) return null;
  
  // Find a 5-digit number representing the zip code
  const match = address.match(/\b\d{5}\b/);
  if (match) {
    const zip = match[0];
    return ZIPCODE_TO_SHOP[zip] || null;
  }
  
  return null;
}
