import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { uploadBufferToGcs } from "@/lib/gcs";
import { dbCache, primeCustomerCache } from "@/lib/db-cache";
import {
  getLineGroupMemberProfile,
  getLineGroupSummary,
  getLineRoomMemberProfile,
  getLineUserProfile,
  isValidLineGroupId,
  isValidLineRoomId,
  isValidLineTargetId,
  isValidLineUserId,
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

    const extractLineInboundAttachments = async (
      event: any,
      ownerKey: string
    ): Promise<SocialMessageAttachment[]> => {
      const inboundAttachments: SocialMessageAttachment[] = [];
      const msgType = event?.message?.type;

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
              entityId: `line_${ownerKey.slice(-12)}`,
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

      return inboundAttachments;
    };

    for (const event of events) {
      const sourceType: string = event?.source?.type || "user";
      const groupId: string | undefined = event?.source?.groupId;
      const roomId: string | undefined = event?.source?.roomId;
      const userId: string | undefined = event?.source?.userId;

      const messageText: string =
        event?.type === "message" && event?.message?.type === "text"
          ? String(event.message.text || "").trim()
          : "";
      const msgType = event?.message?.type;
      const formatNonTextLineBody = (inGroup: boolean): string => {
        if (msgType === "image") return inGroup ? "📷 [Sent a photo in LINE Group]" : "📷 [Sent a photo via LINE]";
        if (msgType === "sticker") return "😊 [Sent a LINE Sticker]";
        if (msgType === "video") return "🎥 [Sent a video via LINE]";
        if (msgType === "audio") return "🎤 [Sent a voice message via LINE]";
        if (msgType === "file") {
          const fname = String(event?.message?.fileName || "Document").trim();
          return `📎 [Sent a file via LINE: ${fname}]`;
        }
        if (msgType === "location") {
          const title = String(event?.message?.title || "").trim();
          const addr = String(event?.message?.address || "").trim();
          const lat = event?.message?.latitude;
          const lng = event?.message?.longitude;
          const label = [title, addr].filter(Boolean).join(" — ");
          const mapsUrl =
            lat !== undefined && lng !== undefined
              ? `https://www.google.com/maps?q=${lat},${lng}`
              : "";
          return `📍 Shared Location${label ? `: ${label}` : ""}${mapsUrl ? `\n🗺️ Google Maps: ${mapsUrl}` : ""}`;
        }
        return inGroup ? "[Joined LINE Group]" : "[Followed LINE Official Account]";
      };
      const isSupportedLineMessageType =
        msgType === "image" ||
        msgType === "sticker" ||
        msgType === "video" ||
        msgType === "audio" ||
        msgType === "file" ||
        msgType === "location";

      // Handle LINE Group Chat (`C...`) and Multi-Person Room (`R...`) separately
      // so replies from Omni Live Chat push back to the GROUP (`C...`/`R...`), NEVER to a single member's DM (`U...`)!
      if (
        (sourceType === "group" && isValidLineGroupId(groupId)) ||
        (sourceType === "room" && isValidLineRoomId(roomId))
      ) {
        const targetGroupId = (sourceType === "group" ? groupId : roomId) as string;
        const shouldRecordGroupEvent =
          Boolean(messageText) || event?.type === "join" || isSupportedLineMessageType;

        if (!shouldRecordGroupEvent) continue;

        const groupSummary =
          sourceType === "group" && settings.channelAccessToken
            ? await getLineGroupSummary(settings.channelAccessToken, targetGroupId)
            : null;
        const groupName =
          groupSummary?.groupName ||
          (sourceType === "group" ? `LINE Group (${targetGroupId.slice(-6)})` : `LINE Room (${targetGroupId.slice(-6)})`);

        let senderDisplayName = "Group Member";
        if (userId && isValidLineUserId(userId) && settings.channelAccessToken) {
          const memberProfile =
            sourceType === "group"
              ? await getLineGroupMemberProfile(settings.channelAccessToken, targetGroupId, userId)
              : await getLineRoomMemberProfile(settings.channelAccessToken, targetGroupId, userId);
          const fallbackProfile = memberProfile || (await getLineUserProfile(settings.channelAccessToken, userId));
          if (fallbackProfile?.displayName) {
            senderDisplayName = fallbackProfile.displayName;
          }
        }

        const inboundAttachments = await extractLineInboundAttachments(event, targetGroupId);
        const rawBodyText = messageText || formatNonTextLineBody(true);

        await recordInboundSocialMessageInternal({
          channel: "line",
          externalContactId: targetGroupId,
          contactName: groupName,
          contactAvatar: groupSummary?.pictureUrl,
          senderName: event?.type === "join" ? groupName : senderDisplayName,
          text: rawBodyText,
          attachments: inboundAttachments.length > 0 ? inboundAttachments : undefined,
          customerId: null,
          externalMessageId: event?.message?.id ? `line_${event.message.id}` : undefined,
        }).catch(() => {});

        continue;
      }

      if (!userId || !isValidLineUserId(userId)) continue;

      // Fast path: reuse cached LINE profile if seen within the last 24h (saves ~200-400ms HTTPS round-trip per message!)
      const cachedContact = contacts.find((c) => c.userId === userId);
      const cachedFresh =
        Boolean(cachedContact?.displayName && cachedContact.displayName !== "LINE User") &&
        Boolean(cachedContact?.lastInteractionAt) &&
        Date.now() - new Date(cachedContact!.lastInteractionAt).getTime() < 24 * 60 * 60 * 1000;

      const profile =
        cachedFresh
          ? {
              userId,
              displayName: cachedContact!.displayName,
              pictureUrl: cachedContact!.pictureUrl,
              statusMessage: cachedContact!.statusMessage,
            }
          : settings.channelAccessToken
          ? await getLineUserProfile(settings.channelAccessToken, userId)
          : null;
      const displayName = profile?.displayName || cachedContact?.displayName || "LINE User";

      let matchedCustomer = prelinkedByLineId.get(userId) || null;

      if (!matchedCustomer) {
        // NEVER auto-link or overwrite a customer who already has a real LINE UID/Group ID (`U...`/`C...`/`R...`)!
        // This prevents two different people with the same display name (e.g. "Gabriel") from hijacking each other's CRM profile.
        const allCustomers = (await loadCandidatePool()).filter(
          (c) => !isValidLineTargetId(c.lineId)
        );

        if (displayName) {
          const normDisplay = normalizeHandle(displayName);
          const lineIdMatches = allCustomers.filter(
            (c) =>
              c.lineId &&
              !isValidLineTargetId(c.lineId) &&
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
        followedAt:
          event.type === "follow"
            ? (existingIdx >= 0 && contacts[existingIdx].followedAt) || nowIso
            : existingIdx >= 0
            ? contacts[existingIdx].followedAt
            : undefined,
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

      if (messageText || event.type === "follow" || isSupportedLineMessageType) {
        const inboundAttachments = await extractLineInboundAttachments(event, userId);

        await recordInboundSocialMessageInternal({
          channel: "line",
          externalContactId: userId,
          contactName: updatedRecord.displayName,
          contactPhone: updatedRecord.linkedCustomerPhone || undefined,
          contactAvatar: updatedRecord.pictureUrl,
          text: messageText || formatNonTextLineBody(false),
          attachments: inboundAttachments.length > 0 ? inboundAttachments : undefined,
          customerId: updatedRecord.linkedCustomerId,
          externalMessageId: event?.message?.id ? `line_${event.message.id}` : undefined,
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
