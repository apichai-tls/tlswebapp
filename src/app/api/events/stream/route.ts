import { NextRequest, NextResponse } from 'next/server';
import {
  subscribeToOrderEvents,
  getBufferedOrderEventsSince,
  getRealtimeBusStatus,
  ensurePgListenerStarted,
  type RealtimeOrderEvent,
} from '@/lib/realtime-bus';
import { resolveRequestUser, canUserAccessJob, canAccessCustomerRecords } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { user, explicitCredentialsProvided } = await resolveRequestUser(request);

  if (!user) {
    return NextResponse.json(
      { error: explicitCredentialsProvided ? 'Unauthorized: Invalid or expired staff session' : 'Unauthorized: Valid server-verified staff session required' },
      { status: 401 }
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: 'Forbidden: This account has been deactivated (Resigned)' },
      { status: 403 }
    );
  }

  await ensurePgListenerStarted();

  const url = new URL(request.url);
  const sinceParam = url.searchParams.get('since') || request.headers.get('last-event-id');
  let sinceMs = 0;
  if (sinceParam) {
    const parsedNum = Number(sinceParam);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      sinceMs = parsedNum;
    } else {
      const parsedDate = Date.parse(sinceParam);
      if (!isNaN(parsedDate)) sinceMs = parsedDate;
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      const sendFrame = (eventName: string, data: any, id?: string) => {
        if (isClosed) return;
        try {
          let payload = '';
          if (id) payload += `id: ${id}\n`;
          payload += `event: ${eventName}\n`;
          payload += `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          isClosed = true;
        }
      };

      const busStatus = getRealtimeBusStatus();
      sendFrame('connected', {
        serverTime: Date.now(),
        instanceId: busStatus.instanceId,
        pgConnected: busStatus.pgConnected,
        userId: user.id,
        role: user.role,
        allowedBranches: user.allowedBranchIds,
      });

      const canReceiveEvent = (ev: RealtimeOrderEvent) => {
        if (ev.type === 'customer.updated') {
          return canAccessCustomerRecords(user, ev.branchId || null);
        }
        return canUserAccessJob(user, ev);
      };

      // Replay any buffered events missed since `sinceMs` that the user is authorized to receive
      if (sinceMs > 0) {
        const missedEvents = getBufferedOrderEventsSince(sinceMs);
        for (const ev of missedEvents) {
          if (canReceiveEvent(ev)) {
            sendFrame('order-update', ev, String(ev.revision));
          }
        }
      }

      const unsubscribe = subscribeToOrderEvents((ev: RealtimeOrderEvent) => {
        if (isClosed) return;
        if (canReceiveEvent(ev)) {
          sendFrame('order-update', ev, String(ev.revision));
        }
      });

      const heartbeatInterval = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          isClosed = true;
        }
      }, 15000);

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(heartbeatInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
