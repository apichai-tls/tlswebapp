import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const entityType = formData.get("entityType") as string || "system";
    const entityId = formData.get("entityId") as string || "temp";
    const subType = formData.get("subType") as string || "proofs";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to public/uploads/entityType/subType/entityId-timestamp.ext
    const now = Date.now();
    let ext = "jpg";
    if (file.name && file.name.includes(".")) {
      ext = file.name.split(".").pop() || "bin";
    } else if (file.type && file.type.includes("/")) {
      const sub = file.type.split("/")[1];
      ext = sub === "jpeg" ? "jpg" : sub;
    }
    const actualName = file.name && (file.name.startsWith("proforma-") || file.name.startsWith("receipt-"))
      ? file.name
      : `${entityId}-${now}.${ext}`;
    const filename = actualName;
    const uploadDir = path.join(process.cwd(), "public", "uploads", entityType, subType);

    // Ensure directory exists
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);
    await fs.promises.writeFile(filePath, buffer);

    const relativeUrl = `/uploads/${entityType}/${subType}/${filename}`;

    return NextResponse.json({
      success: true,
      publicUrl: relativeUrl,
      filePath: relativeUrl,
    });
  } catch (error: any) {
    console.error("Local upload error:", error);
    return NextResponse.json({ error: error.message || "Failed to upload locally" }, { status: 500 });
  }
}
