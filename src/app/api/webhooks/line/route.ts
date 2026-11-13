import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { uploadBufferToGcs } from "@/lib/gcs";
import { dbCache, primeCustomerCache } from "@/lib/db-cache";
import {
  getLineUserProfile,
  verifyLineWebhookSignature,
  type LineContactRecord,
} from "@/lib/line";
import {
  getStoredLineOaSettings,
  invalidateLineContactsCache,
  TLS_CHANNEL_SECRET,
} from "@/lib/line-internal";
import { recordInboundSocialMessageInternal } from "@/lib/social-inbox-internal";
import { SocialMessageAttachment } from "@/types/social-inbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getStoredLineOaSettings();
  return NextResponse.json({
    ok: true,
    service: "That Laundry Shop — LINE Official Account Live Webhook",
    configured: Boolean(settings.channelAccessToken),
    timestamp: new Date().toISOString(),
  });
}

function normalizeDigits(str?: string | null): string {
  if (!str) return "";
  const digits = str.replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length >= 10) {
    return "0" + digits.slice(2);
  }
  return digits;
}

function normalizeHandle(str?: string | null): string {
  if (!str) return "";
  const cleaned = str.trim().toLowerCase().replace(/^@+/, "").trim();
  if (
    !cleaned ||
    cleaned.length < 2 ||
    cleaned === "-" ||
    cleaned === "--" ||
    cleaned === "n/a" ||
    cleaned === "na" ||
    cleaned === "none" ||
    cleaned === "null" ||
    cleaned === "undefined" ||
    cleaned === "line user" ||
    !/[a-z0-9\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/i.test(cleaned)
  ) {
    return "";
  }
  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-line-signature");
    const settings = await getStoredLineOaSettings();

    const candidateSecrets = Array.from(
      new Set(
        [
          settings.channelSecret,
          process.env.LINE_CHANNEL_SECRET,
          process.env.NONAME_LINE_CHANNEL_SECRET,
          TLS_CHANNEL_SECRET,
        ]
          .map((s) => (s || "").trim())
          .filter(Boolean)
      )
    );

    if (candidateSecrets.length === 0) {
      return NextResponse.json(
        { status: "error", message: "LINE channel secret is not configured" },
        { status: 503 }
      );
    }

    if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature.trim())) {
      return NextResponse.json(
        { status: "error", message: "Invalid or missing x-line-signature" },
        { status: 401 }
      );
    }

    const signatureVerified = candidateSecrets.some((sec) =>
      verifyLineWebhookSignature(rawBody, signature, sec)
    );

    const payload = rawBody ? JSON.parse(rawBody) : { events: [] };

    if (!signatureVerified) {
      // Allow secondary LINE OA channel (e.g. NoName Laundry) if NONAME_LINE_CHANNEL_SECRET
      // is not yet set in env, provided request comes from LineBotWebhook with valid destination
      const hasExplicitSecondarySecret = Boolean((process.env.NONAME_LINE_CHANNEL_SECRET || "").trim());
      const ua = req.headers.get("user-agent") || "";
      const hasValidDestination =
        typeof payload?.destination === "string" && /^U[0-9a-f]{32}$/i.test(payload.destination);

      if (hasExplicitSecondarySecret || !ua.startsWith("LineBotWebhook/") || !hasValidDestination) {
        return NextResponse.json(
          { status: "error", message: "Invalid x-line-signature" },
          { status: 401 }
        );
      }
      console.warn("[LINE Webhook] Unmatched channel secret for secondary LINE OA destination:", payload.destination);
    }

    const events: any[] = Array.isArray(payload?.events) ? payload.events : [];

    // LINE Webhook "Verify" button sends an empty events array — return 200 OK immediately
    if (events.length === 0) {
      return NextResponse.json({ status: "ok", verified: true });
    }

    const contactsSetting = await prisma.setting.findUnique({
      where: { key: "lineOaContacts" },
    });
    let contacts: LineContactRecord[] = [];
    if (contactsSetting?.value) {
      try {
        const parsed = JSON.parse(contactsSetting.value);
        if (Array.isArray(parsed)) contacts = parsed;
      } catch {}
    }

    const eventUserIds = Array.from(
      new Set(
        events
          .map((ev) => ev?.source?.userId)
          .filter((uid): uid is string => typeof uid === "string" && /^U[0-9a-f]{32}$/i.test(uid))
      )
    );

    // Fast indexed query only for the active LINE userId(s) instead of scanning all 3,400+ customers
    const prelinkedCustomers =
      eventUserIds.length > 0
        ? await prisma.customer.findMany({
            where: { lineId: { in: eventUserIds } },
            select: {
              id: true,
              name: true,
              nickName: true,
              phone: true,
              secondaryPhone: true,
              lineId: true,
              memberId: true,
            },
          })
        : [];
    type CandidateCustomer = {
      id: string;
      name: string;
      nickName: string | null;
      phone: string | null;
      secondaryPhone: string | null;
      lineId: string | null;
      memberId: string | null;
    };

    const prelinkedByLineId = new Map<string, CandidateCustomer>(
      prelinkedCustomers.filter((c) => c.lineId).map((c) => [c.lineId as string, c])
    );

    // Lazy-loaded pool only if an unlinked LINE user sends a message
    let candidatePool: CandidateCustomer[] | null = null;

    const loadCandidatePool = async () => {
      if (candidatePool) return candidatePool;
      if (Array.isArray(dbCache.customers) && dbCache.customers.length > 0) {
        candidatePool = dbCache.customers.map((c: any) => ({
          id: c.id,
          name: c.name,
          nickName: c.nickName ?? null,
          phone: c.phone ?? null,
          secondaryPhone: c.secondaryPhone ?? null,
          lineId: c.lineId ?? null,
          memberId: c.memberId ?? null,
        }));
        return candidatePool;
      }
      candidatePool = await prisma.customer.findMany({
        select: {
          id: true,
          name: true,
          nickName: true,
          phone: true,
          secondaryPhone: true,
          lineId: true,
          memberId: true,
        },
      });
      return candidatePool;
    };

    for (const event of events) {
      const userId: string | undefined = event?.source?.userId;
      if (!userId || !/^U[0-9a-f]{32}$/i.test(userId)) continue;

      const messageText: string =
        event?.type === "message" && event?.message?.type === "text"
          ? String(event.message.text || "").trim()
          : "";

      const profile = settings.channelAccessToken
        ? await getLineUserProfile(settings.channelAccessToken, userId)
        : null;
      const displayName = profile?.displayName || "LINE User";

      let matchedCustomer = prelinkedByLineId.get(userId) || null;

      if (!matchedCustomer) {
        const allCustomers = await loadCandidatePool();

        if (displayName) {
          const normDisplay = normalizeHandle(displayName);
          const lineIdMatches = allCustomers.filter(
            (c) =>
              c.lineId &&
              !/^U[0-9a-f]{32}$/i.test(c.lineId) &&
              normalizeHandle(c.lineId) === normDisplay
          );
          if (lineIdMatches.length === 1) {
            matchedCustomer = lineIdMatches[0];
          }
        }

        if (!matchedCustomer && messageText) {
          const phoneInMsgMatch = messageText.match(/(?:0|\+?66)[0-9\-\s]{8,12}/);
          if (phoneInMsgMatch) {
            const msgDigits = normalizeDigits(phoneInMsgMatch[0]);
            if (msgDigits.length >= 9 && msgDigits.length <= 11) {
              const phoneMatches = allCustomers.filter(
                (c) =>
                  normalizeDigits(c.phone) === msgDigits ||
                  normalizeDigits(c.secondaryPhone) === msgDigits
              );
              if (phoneMatches.length === 1) {
                matchedCustomer = phoneMatches[0];
              }
            }
          }
        }

        if (!matchedCustomer && displayName) {
          const normDisplay = normalizeHandle(displayName);
          const nameMatches = allCustomers.filter(
            (c) =>
              normalizeHandle(c.name) === normDisplay ||
              (c.nickName && normalizeHandle(c.nickName) === normDisplay)
          );
          if (nameMatches.length === 1) {
            matchedCustomer = nameMatches[0];
          }
        }

        if (matchedCustomer) {
          const updatedCust = await prisma.customer.update({
            where: { id: matchedCustomer.id },
            data: { lineId: userId },
            include: { addresses: { orderBy: { isPrimary: "desc" } } },
          });
          primeCustomerCache(updatedCust);
          prelinkedByLineId.set(userId, matchedCustomer);
        }
      }

      const nowIso = new Date().toISOString();
      const existingIdx = contacts.findIndex((c) => c.userId === userId);
      const updatedRecord: LineContactRecord = {
        userId,
        displayName:
          displayName ||
          (existingIdx >= 0 ? contacts[existingIdx].displayName : "LINE User"),
        pictureUrl:
          profile?.pictureUrl ||
          (existingIdx >= 0 ? contacts[existingIdx].pictureUrl : undefined),
        statusMessage:
          profile?.statusMessage ||
          (existingIdx >= 0 ? contacts[existingIdx].statusMessage : undefined),
        lastInteractionAt: nowIso,
        lastMessageText:
          messageText ||
          (event.type === "follow"
            ? "[Followed LINE OA]"
            : existingIdx >= 0
            ? contacts[existingIdx].lastMessageText
            : undefined),
        linkedCustomerId:
          matchedCustomer?.id ||
          (existingIdx >= 0 ? contacts[existingIdx].linkedCustomerId : null),
        linkedCustomerName:
          matchedCustomer?.name ||
          (existingIdx >= 0 ? contacts[existingIdx].linkedCustomerName : null),
        linkedCustomerPhone: (() => {
          const cand =
            matchedCustomer?.phone ||
            (existingIdx >= 0 ? contacts[existingIdx].linkedCustomerPhone : null);
          return normalizeDigits(cand).length >= 8 ? cand : null;
        })(),
      };

      if (existingIdx >= 0) {
        contacts.splice(existingIdx, 1);
      }
      contacts.unshift(updatedRecord);

      const msgType = event?.message?.type;
      if (messageText || event.type === "follow" || msgType === "image" || msgType === "sticker") {
        const inboundAttachments: SocialMessageAttachment[] = [];

        if (msgType === "image" && event?.message?.id && settings.channelAccessToken) {
          try {
            const msgId = String(event.message.id).replace(/[^a-zA-Z0-9_-]/g, "");
            const imgRes = await fetch(
              `https://api-data.line.me/v2/bot/message/${encodeURIComponent(msgId)}/content`,
              {
                headers: {
                  Authorization: `Bearer ${settings.channelAccessToken.trim()}`,
                },
              }
            );
            if (imgRes.ok) {
              const arrBuf = await imgRes.arrayBuffer();
              const rawBuffer = Buffer.from(arrBuf);
              const contentType = imgRes.headers.get("content-type") || "image/jpeg";
              const filename = `line-${msgId}.jpg`;

              let imageUrl = await uploadBufferToGcs(rawBuffer, {
                entityType: "system",
                entityId: `line_${userId.slice(-12)}`,
                subType: "chat",
                contentType,
                extension: "jpg",
                customFileName: filename,
              });

              if (!imageUrl) {
                const uploadDir = path.resolve(process.cwd(), "storage", "uploads", "system", "chat");
                await fs.promises.mkdir(uploadDir, { recursive: true });
                await fs.promises.writeFile(path.join(uploadDir, filename), rawBuffer);
                imageUrl = `/uploads/system/chat/${filename}`;
              }

              inboundAttachments.push({
                type: "image",
                url: imageUrl,
                name: "LINE Customer Photo",
              });
            }
          } catch (e) {
            console.warn("[LINE Webhook] Failed to download inbound image:", e);
          }
        } else if (msgType === "sticker" && event?.message?.stickerId) {
          const stickerId = String(event.message.stickerId).replace(/\D/g, "");
          if (stickerId) {
            inboundAttachments.push({
              type: "image",
              url: `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`,
              name: "LINE Sticker",
            });
          }
        }

        await recordInboundSocialMessageInternal({
          channel: "line",
          externalContactId: userId,
          contactName: updatedRecord.displayName,
          contactPhone: updatedRecord.linkedCustomerPhone || undefined,
          contactAvatar: updatedRecord.pictureUrl,
          text:
            messageText ||
            (msgType === "image"
              ? "📷 [Sent a photo via LINE]"
              : msgType === "sticker"
              ? "😊 [Sent a LINE Sticker]"
              : "[Followed LINE Official Account]"),
          attachments: inboundAttachments.length > 0 ? inboundAttachments : undefined,
          customerId: updatedRecord.linkedCustomerId,
        }).catch(() => {});
      }
    }

    const trimmedContacts = contacts.slice(0, 20000);
    await prisma.setting.upsert({
      where: { key: "lineOaContacts" },
      update: { value: JSON.stringify(trimmedContacts) },
      create: { key: "lineOaContacts", value: JSON.stringify(trimmedContacts) },
    });
    invalidateLineContactsCache();

    return NextResponse.json({ status: "ok", processed: events.length });
  } catch (err: any) {
    console.error("[LINE Webhook Error]:", err);
    return NextResponse.json(
      { status: "error", message: "Webhook error" },
      { status: 500 }
    );
  }
}
