import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { resolveRequestUser } from "@/lib/server-auth";
import { verifyCustomerToken, verifyServiceApiKey } from "@/lib/external-api-auth";

const ALLOWED_ENTITY_TYPES = new Set([
  "job",
  "jobs",
  "rider",
  "riders",
  "system",
  "task",
  "tasks",
  "marketing",
  "customer",
  "customers",
]);
const SAFE_SUBTYPE_REGEX =
  /^(bags|proofs|bills|avatars|attachments|notes|slips|marketing|banners|qr|chat|logos|receipts|proformas)([_-][a-zA-Z0-9_-]{1,48})?$/;
const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "pdf",
  "heic",
  "heif",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "zip",
  "mp4",
  "mov",
]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(request: NextRequest) {
  try {
    // 1. Enforce staff/rider session or external API/customer authentication
    const { user } = await resolveRequestUser(request);
    const authHeader = request.headers.get("authorization");
    const hasApiKeyHeader = Boolean(request.headers.get("x-api-key") || request.headers.get("X-API-KEY"));
    const isExternalAuthorized =
      (!user || !user.isActive) &&
      ((hasApiKeyHeader && verifyServiceApiKey(request)) ||
        (authHeader ? Boolean(verifyCustomerToken(authHeader)) : false));

    if ((!user || !user.isActive) && !isExternalAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized: Valid staff or rider session required for upload" },
        { status: user && !user.isActive ? 403 : 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const rawEntityType = (formData.get("entityType") as string) || "system";
    const rawEntityId = (formData.get("entityId") as string) || "temp";
    const rawSubType = (formData.get("subType") as string) || "proofs";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const entityType = rawEntityType.trim();
    const entityId = rawEntityId.trim();
    const subType = rawSubType.trim();

    if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
      return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
    }
    if (!SAFE_SUBTYPE_REGEX.test(subType) || subType.includes("..")) {
      return NextResponse.json({ error: "Invalid subType" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(entityId)) {
      return NextResponse.json({ error: "Invalid entityId format" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File exceeds maximum allowed size (15MB)" }, { status: 413 });
    }
    const buffer = Buffer.from(bytes);

    // Save to public/uploads/entityType/subType/entityId-timestamp.ext
    const now = Date.now();
    let ext = "jpg";
    if (file.name && file.name.includes(".")) {
      ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    } else if (file.type && file.type.includes("/")) {
      const sub = file.type.split("/")[1]?.split(";")[0]?.trim().toLowerCase() || "jpg";
      ext = sub === "jpeg" ? "jpg" : sub;
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Disallowed file extension: .${ext}` }, { status: 400 });
    }

    const normalizedExt = ext === "jpeg" ? "jpg" : ext;
    const baseFileName = file.name ? path.basename(file.name) : "";
    const isSafeReceiptOrProforma =
      /^(proforma|receipt)-[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp|pdf)$/i.test(baseFileName) &&
      !baseFileName.includes("..");

    const filename = isSafeReceiptOrProforma
      ? baseFileName
      : `${entityId}-${now}.${normalizedExt}`;

    const baseUploadsRoot = path.resolve(process.cwd(), "public", "uploads");
    const uploadDir = path.resolve(baseUploadsRoot, entityType, subType);
    const filePath = path.resolve(uploadDir, filename);

    if (!uploadDir.startsWith(baseUploadsRoot + path.sep) || !filePath.startsWith(uploadDir + path.sep)) {
      return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
    }

    // Ensure directory exists
    await fs.promises.mkdir(uploadDir, { recursive: true });
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
