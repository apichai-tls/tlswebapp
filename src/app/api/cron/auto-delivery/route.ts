import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publishOrderEvent } from '@/lib/realtime-bus';

export const dynamic = 'force-dynamic';

function verifyCronToken(request: Request): boolean {
  const expectedToken = (process.env.CRON_SECRET || 'TLSUpdateDeliveryCron6497!').trim();
  if (!expectedToken) return false;

  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const headerToken = request.headers.get('x-cron-secret')?.trim();
  const queryToken = searchParams.get('token')?.trim();
  const suppliedToken = bearerToken || headerToken || queryToken || '';

  if (!suppliedToken || suppliedToken.length !== expectedToken.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(suppliedToken), Buffer.from(expectedToken));
}

function computeMostRecentAutoDeliveryCutoffUtc(nowUtc: Date = new Date()): Date {
  const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowBangkok = new Date(nowUtc.getTime() + BANGKOK_OFFSET_MS);

  // 19:05 Bangkok time = 12:05 UTC on that Bangkok calendar date
  const todayTargetUtcMs =
    Date.UTC(
      nowBangkok.getUTCFullYear(),
      nowBangkok.getUTCMonth(),
      nowBangkok.getUTCDate(),
      19,
      5,
      0,
      0
    ) - BANGKOK_OFFSET_MS;

  if (nowUtc.getTime() >= todayTargetUtcMs) {
    return new Date(todayTargetUtcMs);
  }
  // Yesterday's 19:05 Bangkok time (= 12:05 UTC yesterday)
  return new Date(todayTargetUtcMs - 24 * 60 * 60 * 1000);
}

function appendAutoDeliveryNotePreservingKeys(
  rawAdminNotesJson: string | null | undefined,
  logEntry: { id: string; userId: string; userName: string; text: string; timestamp: string },
  nowMs: number = Date.now()
): { updatedJson: string; skippedDuplicate: boolean } {
  let notes: any[] = [];
  let payments: any[] = [];
  let isStructured = false;
  let extraKeys: Record<string, any> = {};

  if (rawAdminNotesJson) {
    try {
      const parsed = JSON.parse(rawAdminNotesJson);
      if (Array.isArray(parsed)) {
        notes = [...parsed];
      } else if (parsed && typeof parsed === 'object') {
        isStructured = true;
        const { notes: parsedNotes, payments: parsedPayments, ...rest } = parsed;
        extraKeys = rest;
        notes = Array.isArray(parsedNotes) ? [...parsedNotes] : [];
        payments = Array.isArray(parsedPayments) ? [...parsedPayments] : [];
      }
    } catch {
      notes = [];
    }
  }

  const hasRecentAutoDeliveryNote = notes.some(
    (note: any) =>
      note.userName === 'System Auto-Delivery' &&
      note.text === 'Automatically moved from Process to Delivery after 19:05' &&
      nowMs - new Date(note.timestamp).getTime() < 60 * 60 * 1000
  );

  if (hasRecentAutoDeliveryNote) {
    return {
      updatedJson: rawAdminNotesJson || JSON.stringify(notes),
      skippedDuplicate: true,
    };
  }

  notes.push(logEntry);
  const hasExtraKeys = Object.keys(extraKeys).length > 0;
  const updatedJson =
    isStructured || payments.length > 0 || hasExtraKeys
      ? JSON.stringify({ ...extraKeys, payments, notes })
      : JSON.stringify(notes);

  return { updatedJson, skippedDuplicate: false };
}

export async function GET(request: Request) {
  // Security token check to protect production route — fail closed when CRON_SECRET is missing or mismatched
  if (!verifyCronToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const mostRecentTargetUtc = computeMostRecentAutoDeliveryCutoffUtc(new Date());

    const jobsToMove = await prisma.job.findMany({
      where: {
        status: 'billing',
        updatedAt: { lt: mostRecentTargetUtc },
      },
      select: { id: true },
    });

    if (jobsToMove.length > 0) {
      const movedJobIds: string[] = [];

      for (const candidate of jobsToMove) {
        const id = candidate.id;
        const logEntry = {
          id: Math.random().toString(36).substring(7),
          userId: 'system',
          userName: 'System Auto-Delivery',
          text: 'Automatically moved from Process to Delivery after 19:05',
          timestamp: new Date().toISOString(),
        };

        try {
          const txResult = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Job" WHERE id = ${id} FOR UPDATE`;
            const job = await tx.job.findUnique({
              where: { id },
              select: { id: true, status: true, updatedAt: true, adminNotesJson: true },
            });
            if (!job || job.status !== 'billing' || job.updatedAt >= mostRecentTargetUtc) {
              return null;
            }

            const { updatedJson, skippedDuplicate } = appendAutoDeliveryNotePreservingKeys(
              job.adminNotesJson,
              logEntry
            );

            const updatedJob = await tx.job.update({
              where: { id },
              data: {
                status: 'delivery',
                ...(skippedDuplicate ? {} : { adminNotesJson: updatedJson }),
              },
            });

            return { updatedJob, skippedDuplicate };
          });

          if (txResult?.updatedJob) {
            movedJobIds.push(id);
            await publishOrderEvent({
              type: 'job.updated',
              job: txResult.updatedJob,
              action: 'cron_auto_delivery',
              changedFields: txResult.skippedDuplicate ? ['status'] : ['status', 'adminNotesJson'],
              actorId: 'system',
              actorName: 'System Auto-Delivery',
            });
          }
        } catch (e) {
          console.error(`Failed to auto-move job ${id}`, e);
        }
      }
      return NextResponse.json({ success: true, movedJobs: movedJobIds.length, jobIds: movedJobIds });
    }
    return NextResponse.json({ success: true, movedJobs: 0 });
  } catch (error: any) {
    console.error('Failed to run auto-move jobs routine:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
