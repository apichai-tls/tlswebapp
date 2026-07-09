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

    // Save to public/uploads/entityType/subType/filename
    const now = Date.now();
    const ext = file.type.split("/")[1] || "jpg";
    let filename = `${entityId}-${now}.${ext}`;
    if (file.name) {
      const sanitized = file.name.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
      if (sanitized && !sanitized.startsWith("..")) {
        filename = sanitized;
      }
    }
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
