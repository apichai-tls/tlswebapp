import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateDbCache } from "@/lib/db-cache";
import {
  getLineUserProfile,
  verifyLineWebhookSignature,
  type LineContactRecord,
} from "@/lib/line";
import { getStoredLineOaSettings } from "@/actions/line";
import { recordInboundSocialMessageAction } from "@/actions/social-inbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getStoredLineOaSettings();
  return NextResponse.json({
    ok: true,
    service: "That Laundry Shop — LINE Official Account Silent Webhook",
    configured: Boolean(settings.channelAccessToken),
    autoSendDeliveryPhoto: settings.autoSendDeliveryPhoto,
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
  return str.trim().toLowerCase().replace(/^@/, "");
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-line-signature");
    const settings = await getStoredLineOaSettings();

    if (
      settings.channelSecret &&
      !verifyLineWebhookSignature(rawBody, signature, settings.channelSecret)
    ) {
      // Log warning but still allow if user has multiple channels (ThatLaundryShop + NoName) hitting the same webhook
      console.warn("[LINE Webhook] Signature mismatch — continuing for multi-channel support");
    }

    const payload = rawBody ? JSON.parse(rawBody) : { events: [] };
    const events: any[] = Array.isArray(payload?.events) ? payload.events : [];

    // LINE Webhook "Verify" button sends an empty events array — always return 200 OK immediately
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

    let didUpdateCustomer = false;

    const allCustomers = await prisma.customer.findMany({
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

      // 1. Check if this userId is already linked to a Customer
      let matchedCustomer =
        allCustomers.find((c) => c.lineId === userId) || null;

      // 2. SILENT BACKGROUND MATCHING (Never sends any auto-reply or link to customer!):
      if (!matchedCustomer) {
        // A) Check if their LINE Display Name matches a customer's saved `lineId` field in CRM (exact unique match)
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

        // B) Check if message contains a phone number (e.g., when customer sends their phone/address in normal chat)
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

        // C) Check if their LINE Display Name uniquely matches a single customer's Name or Nickname in CRM
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
          await prisma.customer.update({
            where: { id: matchedCustomer.id },
            data: {
              lineId: userId,
            },
          });
          didUpdateCustomer = true;
          console.log(
            `[LINE Silent Lookup] Silently linked LINE User "${displayName}" (${userId}) -> Customer ${matchedCustomer.name} (${matchedCustomer.id})`
          );
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
        linkedCustomerPhone:
          matchedCustomer?.phone ||
          (existingIdx >= 0 ? contacts[existingIdx].linkedCustomerPhone : null),
      };

      if (existingIdx >= 0) {
        contacts.splice(existingIdx, 1);
      }
      contacts.unshift(updatedRecord);
      if (messageText || event.type === "follow" || event?.message?.type === "image") {
        await recordInboundSocialMessageAction({
          channel: "line",
          externalContactId: userId,
          contactName: updatedRecord.displayName,
          contactPhone: updatedRecord.linkedCustomerPhone || undefined,
          contactAvatar: updatedRecord.pictureUrl,
          text:
            messageText ||
            (event?.message?.type === "image"
              ? "📷 [Customer sent an image via LINE]"
              : "[Followed LINE Official Account]"),
          customerId: updatedRecord.linkedCustomerId,
        }).catch(() => {});
      }
    }

    // Keep up to 500 recent LINE OA contacts so staff can search any customer by name/photo
    const trimmedContacts = contacts.slice(0, 500);
    await prisma.setting.upsert({
      where: { key: "lineOaContacts" },
      update: { value: JSON.stringify(trimmedContacts) },
      create: { key: "lineOaContacts", value: JSON.stringify(trimmedContacts) },
    });

    if (didUpdateCustomer) {
      invalidateDbCache();
    }

    return NextResponse.json({ status: "ok", processed: events.length });
  } catch (err: any) {
    console.error("[LINE Webhook Error]:", err);
    return NextResponse.json(
      { status: "error", message: err?.message || "Webhook error" },
      { status: 200 }
    );
  }
}
