import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { resolveRequestUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

interface OcrReceiptResult {
  amount: number | null;
  transactionDate: string | null;
  vendorName: string | null;
  invoiceNo: string | null;
  description: string | null;
  category: string | null;
  vehiclePlate: string | null;
  paymentMethod: "Cash" | "Transfer" | "QR" | null;
  confidence: "high" | "medium" | "low";
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function POST(request: NextRequest) {
  try {
    const { user: authUser } = await resolveRequestUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if ((authUser.role || "").toLowerCase() === "rider") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ (สามารถกรอกข้อมูลด้วยตนเองได้ตามปกติ)",
        },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.imageBase64 !== "string" || !body.imageBase64.trim()) {
      return NextResponse.json(
        { success: false, error: "กรุณาถ่ายหรือเลือกรูปใบเสร็จก่อนให้ AI อ่าน" },
        { status: 400 }
      );
    }

    // Strip data URL prefix if present
    let base64Data = body.imageBase64.trim();
    let mimeType =
      typeof body.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim()
        : "image/jpeg";
    const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      base64Data = dataUrlMatch[2];
    }

    // Guard against huge payloads (> 8MB base64)
    if (base64Data.length > 8 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "ไฟล์รูปมีขนาดใหญ่เกินไป กรุณาลองใหม่อีกครั้ง" },
        { status: 413 }
      );
    }

    const categories: string[] = Array.isArray(body.categories)
      ? body.categories.map((c: any) => String(c).trim()).filter(Boolean).slice(0, 40)
      : [];
    const vehiclePlates: string[] = Array.isArray(body.vehiclePlates)
      ? body.vehiclePlates.map((p: any) => String(p).trim()).filter(Boolean).slice(0, 40)
      : [];

    const todayIso = new Date().toISOString().slice(0, 10);
    const prompt = [
      "You are an expert Thai/English accounting receipt & tax invoice OCR extractor for a laundry business (That Laundry Shop, Thailand).",
      "Analyze the provided receipt, tax invoice, fuel slip, or payment slip image and extract structured fields.",
      "Return ONLY a valid JSON object with these exact keys (no markdown fences, no commentary):",
      "{",
      '  "amount": number | null,             // Grand total paid in THB (สุทธิ/รวมทั้งสิ้น). Number only, no currency symbol.',
      '  "transactionDate": "YYYY-MM-DD" | null, // Convert Buddhist Era year (พ.ศ. e.g. 2569 -> 2026, subtract 543) to Gregorian YYYY-MM-DD. Today is ' + todayIso + ".",
      '  "vendorName": string | null,         // Shop / Merchant / Gas station name (e.g. "PTT Station", "7-Eleven", "HomePro").',
      '  "invoiceNo": string | null,          // Receipt / Tax Invoice / Bill / Ref number if visible.',
      '  "description": string | null,        // Short clear summary of what was bought (Thai or English, max 80 chars, e.g. "เติมน้ำมันรถส่งผ้า", "ซื้อน้ำยาซักผ้า/ถุง").',
      '  "category": string | null,           // Must be ONE exact string from the Allowed Categories list below if clearly matching, else null.',
      '  "vehiclePlate": string | null,       // If a vehicle license plate appears on the receipt/slip (e.g. fuel/repair), match from Allowed Plates if possible, else extracted plate or null.',
      '  "paymentMethod": "Cash" | "Transfer" | "QR" | null, // Infer if visible (เงินสด=Cash, โอน=Transfer, พร้อมเพย์/PromptPay/QR=QR).',
      '  "confidence": "high" | "medium" | "low"',
      "}",
      categories.length > 0 ? `Allowed Categories: ${JSON.stringify(categories)}` : "",
      vehiclePlates.length > 0 ? `Allowed Vehicle Plates: ${JSON.stringify(vehiclePlates)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const ai = new GoogleGenAI({ apiKey });
    const modelsToTry = Array.from(
      new Set(
        [
          "gemini-2.5-flash",
          (process.env.GEMINI_MODEL || "").trim(),
          "gemini-2.0-flash",
        ].filter(Boolean)
      )
    );

    let rawText = "";
    let modelUsed = "";
    let lastErr: any = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Data } },
              ],
            },
          ],
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });
        const text = (response.text || "").trim();
        if (text) {
          rawText = text;
          modelUsed = model;
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (!rawText) {
      return NextResponse.json(
        {
          success: false,
          error:
            lastErr?.message ||
            "AI ไม่สามารถอ่านรูปใบเสร็จได้ในขณะนี้ กรุณากรอกข้อมูลด้วยตนเอง",
        },
        { status: 502 }
      );
    }

    let parsed: Partial<OcrReceiptResult> = {};
    try {
      parsed = JSON.parse(stripJsonFences(rawText));
    } catch {
      return NextResponse.json(
        { success: false, error: "ไม่สามารถแปลงผลลัพธ์จาก AI ได้ กรุณาลองถ่ายให้ชัดขึ้น" },
        { status: 422 }
      );
    }

    const numAmt = typeof parsed.amount === "number" ? parsed.amount : Number(parsed.amount);
    const validAmount =
      Number.isFinite(numAmt) && numAmt > 0 ? Math.round(numAmt * 100) / 100 : null;

    let validDate: string | null = null;
    if (
      typeof parsed.transactionDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.transactionDate.trim())
    ) {
      const yr = Number(parsed.transactionDate.slice(0, 4));
      if (yr >= 2500) {
        validDate = `${yr - 543}${parsed.transactionDate.slice(4)}`;
      } else if (yr >= 2020 && yr <= 2100) {
        validDate = parsed.transactionDate.trim();
      }
    }

    const validPayment =
      parsed.paymentMethod === "Cash" ||
      parsed.paymentMethod === "Transfer" ||
      parsed.paymentMethod === "QR"
        ? parsed.paymentMethod
        : null;

    const data: OcrReceiptResult = {
      amount: validAmount,
      transactionDate: validDate,
      vendorName:
        typeof parsed.vendorName === "string" && parsed.vendorName.trim()
          ? parsed.vendorName.trim()
          : null,
      invoiceNo:
        typeof parsed.invoiceNo === "string" && parsed.invoiceNo.trim()
          ? parsed.invoiceNo.trim()
          : null,
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : null,
      category:
        typeof parsed.category === "string" && parsed.category.trim()
          ? parsed.category.trim()
          : null,
      vehiclePlate:
        typeof parsed.vehiclePlate === "string" && parsed.vehiclePlate.trim()
          ? parsed.vehiclePlate.trim()
          : null,
      paymentMethod: validPayment,
      confidence:
        parsed.confidence === "high" ||
        parsed.confidence === "medium" ||
        parsed.confidence === "low"
          ? parsed.confidence
          : "medium",
    };

    return NextResponse.json({ success: true, data, modelUsed });
  } catch (err: any) {
    console.error("[POST /api/petty-cash/ocr] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "OCR failed" },
      { status: 500 }
    );
  }
}
