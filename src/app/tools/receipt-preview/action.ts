"use server";

import { prisma } from "@/lib/prisma";

export async function updateJobReceiptUrlAction(jobId: string, newReceiptUrl: string) {
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, billImageUrl: true },
    });

    if (!job) {
      return { success: false, error: `Job #${jobId} not found` };
    }

    let existingUrls: string[] = [];
    if (job.billImageUrl) {
      try {
        const parsed = JSON.parse(job.billImageUrl);
        if (Array.isArray(parsed)) {
          existingUrls = parsed;
        } else if (typeof parsed === "string") {
          existingUrls = [parsed];
        }
      } catch {
        existingUrls = [job.billImageUrl];
      }
    }

    // Replace any existing receipt URL with the new receipt URL, preserving other attachments (e.g. proforma, bills)
    const filteredUrls = existingUrls.filter(
      (url) => !url.includes(`receipt-${jobId}.png`) && !url.endsWith("receipt.png")
    );
    const updatedUrls = [...filteredUrls, newReceiptUrl];

    await prisma.job.update({
      where: { id: jobId },
      data: {
        billImageUrl: JSON.stringify(updatedUrls),
      },
    });

    return {
      success: true,
      updatedUrls,
      newReceiptUrl,
    };
  } catch (error: any) {
    console.error("Failed to update receipt URL in DB:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}
