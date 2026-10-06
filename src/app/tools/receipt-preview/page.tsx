import React from "react";
import { prisma } from "@/lib/prisma";
import ReceiptPreviewClient from "./ReceiptPreviewClient";

export const dynamic = "force-dynamic";

export default async function ReceiptPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; auto?: string }>;
}) {
  const { jobId = "2026005033", auto = "false" } = await searchParams;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      customer: true,
      branch: true,
    },
  });

  if (!job) {
    return (
      <div className="p-8 text-rose-500 font-bold bg-slate-900 min-h-screen">
        Job #{jobId} not found in database.
      </div>
    );
  }

  // Serialize to plain JSON so it cleanly crosses the Server-to-Client boundary
  const serializedJob = JSON.parse(JSON.stringify(job));
  const serializedCustomer = job.customer ? JSON.parse(JSON.stringify(job.customer)) : null;
  const serializedBranch = job.branch ? JSON.parse(JSON.stringify(job.branch)) : null;

  return (
    <ReceiptPreviewClient
      initialJob={serializedJob}
      initialCustomer={serializedCustomer}
      initialBranch={serializedBranch}
      autoRun={auto === "true"}
    />
  );
}
