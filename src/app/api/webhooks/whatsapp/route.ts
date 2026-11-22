import { GET as socialGet, POST as socialPost } from '../social/route';

export const dynamic = 'force-dynamic';

/**
 * Dedicated Meta WhatsApp Business Cloud API Webhook Endpoint (/api/webhooks/whatsapp)
 * Handles:
 *  - GET: Meta hub.challenge webhook verification
 *  - POST: Inbound WhatsApp text, images, PDFs/documents, voice notes, locations, and read/delivery status callbacks
 */
export const GET = socialGet;
export const POST = socialPost;
