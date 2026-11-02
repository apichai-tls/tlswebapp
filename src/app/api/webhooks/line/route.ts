import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateDbCache } from "@/lib/db-cache";
import {
  getLineUserProfile,
  sendLineReplyMessage,
  verifyLineWebhookSignature,
  type LineContactRecord,
} from "@/lib/line";
import { getStoredLineOaSettings } from "@/actions/line";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getStoredLineOaSettings();
  return NextResponse.json({
    ok: true,
    service: "That Laundry Shop — LINE Official Account Webhook",
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

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-line-signature");
    const settings = await getStoredLineOaSettings();

    if (
      settings.channelSecret &&
      !verifyLineWebhookSignature(rawBody, signature, settings.channelSecret)
    ) {
      console.warn("[LINE Webhook] Invalid x-line-signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = rawBody ? JSON.parse(rawBody) : { events: [] };
    const events: any[] = Array.isArray(payload?.events) ? payload.events : [];

    // LINE Webhook "Verify" button sends an empty events array or dummy token — always return 200 OK immediately
    if (events.length === 0) {
      return NextResponse.json({ status: "ok", verified: true });
    }

    // Load existing recent LINE contacts cache
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

    for (const event of events) {
      const userId: string | undefined = event?.source?.userId;
      if (!userId || !/^U[0-9a-f]{32}$/i.test(userId)) continue;

      const replyToken: string | undefined = event?.replyToken;
      const messageText: string =
        event?.type === "message" && event?.message?.type === "text"
          ? String(event.message.text || "").trim()
          : "";

      // Fetch user's LINE profile (displayName, pictureUrl)
      const profile = settings.channelAccessToken
        ? await getLineUserProfile(settings.channelAccessToken, userId)
        : null;
      const displayName = profile?.displayName || "LINE User";

      // Check if this userId is already linked to a Customer
      let matchedCustomer = await prisma.customer.findFirst({
        where: { lineId: userId },
      });

      // If not yet linked, attempt smart auto-matching by:
      // 1) Phone number or Member ID typed in their message (e.g. "0812345678", "OF2285")
      // 2) Display name matching an existing Customer's `lineId` or `name`
      if (!matchedCustomer) {
        const msgDigits = normalizeDigits(messageText);
        const memberCodeMatch = messageText.match(/\b([A-Z]{1,3}[-]?\d{3,6})\b/i);

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

        if (msgDigits.length >= 9) {
          matchedCustomer =
            (allCustomers.find(
              (c) =>
                normalizeDigits(c.phone) === msgDigits ||
                normalizeDigits(c.secondaryPhone) === msgDigits
            ) as any) || null;
        }

        if (!matchedCustomer && memberCodeMatch) {
          const codeUpper = memberCodeMatch[1].replace(/-/g, "").toUpperCase();
          matchedCustomer =
            (allCustomers.find(
              (c) =>
                c.memberId &&
                c.memberId.replace(/-/g, "").toUpperCase() === codeUpper
            ) as any) || null;
        }

        if (!matchedCustomer && displayName) {
          const lowerDisplay = displayName.trim().toLowerCase();
          matchedCustomer =
            (allCustomers.find(
              (c) =>
                (c.lineId &&
                  c.lineId.trim().toLowerCase().replace(/^@/, "") === lowerDisplay) ||
                (c.name && c.name.trim().toLowerCase() === lowerDisplay) ||
                (c.nickName && c.nickName.trim().toLowerCase() === lowerDisplay)
            ) as any) || null;
        }

        if (matchedCustomer) {
          await prisma.customer.update({
            where: { id: matchedCustomer.id },
            data: { lineId: userId },
          });
          didUpdateCustomer = true;
          console.log(
            `[LINE Webhook] Auto-linked LINE User ${displayName} (${userId}) -> Customer ${matchedCustomer.name} (${matchedCustomer.id})`
          );

          // Send a friendly confirmation reply if they sent their phone number / member ID
          if (
            replyToken &&
            settings.channelAccessToken &&
            (msgDigits.length >= 9 || memberCodeMatch || event.type === "follow")
          ) {
            await sendLineReplyMessage(settings.channelAccessToken, replyToken, [
              {
                type: "text",
                text: `✅ Connected! Hello ${matchedCustomer.name}, your LINE account is now linked to That Laundry Shop. You will automatically receive delivery proof photos and order updates here! 🧺💚`,
              },
            ]).catch(() => {});
          }
        } else if (event.type === "follow" && replyToken && settings.channelAccessToken) {
          // New follower whose name didn't match yet — invite them to reply with their phone number
          await sendLineReplyMessage(settings.channelAccessToken, replyToken, [
            {
              type: "text",
              text: `Welcome to That Laundry Shop! 🧺✨\nPlease reply with your registered Phone Number (e.g. 0812345678) so we can automatically send your laundry delivery proof photos & order updates to this chat! 💚`,
            },
          ]).catch(() => {});
        }
      }

      // Upsert into `lineOaContacts` list (keep up to 100 recent contacts)
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
            ? "[Added LINE Official Account]"
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
    }

    // Save recent contacts (limit 100)
    const trimmedContacts = contacts.slice(0, 100);
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
