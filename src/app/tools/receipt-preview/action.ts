"use server";

import { prisma } from "@/lib/prisma";
import { invalidateDbCache } from "@/lib/db-cache";
import { assertServerActionAuthorized, canUserAccessJob } from "@/lib/server-auth";

export async function updateJobReceiptUrlAction(jobId: string, newReceiptUrl: string) {
  try {
    const user = await assertServerActionAuthorized({ requireWrite: true, forbidRoles: ["rider"] });

    const trimmedUrl = (newReceiptUrl || "").trim();
    if (
      !trimmedUrl ||
      (!trimmedUrl.startsWith("/uploads/") &&
        !trimmedUrl.startsWith("https://storage.googleapis.com/") &&
        !trimmedUrl.startsWith("https://www.thatlaundryshop.com/"))
    ) {
      return { success: false, error: "Invalid receipt URL origin" };
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        billImageUrl: true,
        branchId: true,
        riderId: true,
        pickupRiderId: true,
        deliveryRiderId: true,
      },
    });

    if (!job) {
      return { success: false, error: `Job #${jobId} not found` };
    }
    if (!canUserAccessJob(user, job)) {
      return { success: false, error: "Forbidden: no access to this order" };
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

    const filteredUrls = existingUrls.filter(
      (url) => !url.includes(`receipt-${jobId}.png`) && !url.endsWith("receipt.png")
    );
    const updatedUrls = [...filteredUrls, trimmedUrl];

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        billImageUrl: JSON.stringify(updatedUrls),
      },
    });

    invalidateDbCache("jobs");

    const { publishOrderEvent } = await import("@/lib/realtime-bus");
    await publishOrderEvent({
      type: "job.updated",
      job: updatedJob,
      action: "receipt_url",
      changedFields: ["billImageUrl"],
      actorName: user.name || "Receipt Generator",
    });

    return {
      success: true,
      updatedUrls,
      newReceiptUrl: trimmedUrl,
    };
  } catch (error: any) {
    console.error("Failed to update receipt URL in DB:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
}
