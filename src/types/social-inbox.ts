export type SocialChannel =
  | 'whatsapp'
  | 'line'
  | 'facebook'
  | 'instagram'
  | 'telegram'
  | 'wechat';

export type SocialMessageDirection = 'inbound' | 'outbound';

export type SocialMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface SocialMessageAttachment {
  type: 'image' | 'file' | 'order_card';
  url?: string;
  name?: string;
  jobId?: string;
  jobSummary?: string;
}

export interface SocialMessageReplyRef {
  messageId: string;
  senderName: string;
  text: string;
}

export interface SocialMessage {
  id: string;
  conversationId: string;
  channel: SocialChannel;
  direction: SocialMessageDirection;
  text: string;
  attachments?: SocialMessageAttachment[];
  replyTo?: SocialMessageReplyRef;
  senderName: string;
  senderId?: string;
  senderRole?: string;
  status: SocialMessageStatus;
  deliveryMethod?:
    | 'line_api'
    | 'whatsapp_cloud_api'
    | 'whatsapp_gateway_api'
    | 'whatsapp_web_bridge'
    | 'meta_graph_api'
    | 'telegram_bot_api'
    | 'social_api'
    | 'platform_log';
  externalMessageId?: string;
  externalError?: string;
  createdAt: string;
}

export interface SocialConversation {
  id: string;
  channel: SocialChannel;
  externalContactId: string; // E.164 phone for WhatsApp, U-id for LINE, handle/id for IG/FB/Telegram
  contactName: string;
  contactPhone?: string;
  contactAvatar?: string;
  contactHandle?: string;
  customerId?: string | null;
  customerName?: string | null;
  customerMemberId?: string | null;
  customerWalletBalance?: number;
  brand?: 'that_laundry_shop' | 'noname_laundry';
  branchId?: string | null;
  branchName?: string | null;
  status: 'open' | 'pending' | 'resolved';
  unreadCount: number;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  tags?: string[];
  notes?: string;
  lastMessageText: string;
  lastMessageAt: string;
  lastMessageDirection: SocialMessageDirection;
  createdAt: string;
  updatedAt: string;
}

export interface SocialChannelConfig {
  whatsapp: {
    enabled: boolean;
    mode: 'web_bridge' | 'cloud_api' | 'gateway_api';
    launchTarget?: 'companion_popup' | 'native_app' | 'web_tab';
    businessPhoneNumber: string;
    defaultCountryCode: string;
    autoOpenWaWebOnSend: boolean;
    phoneNumberId?: string;
    accessToken?: string;
    verifyToken?: string;
    gatewayUrl?: string;
    gatewayApiKey?: string;
    gatewayInstanceId?: string;
  };
  line: {
    enabled: boolean;
    basicId: string;
    botName: string;
    secondaryBasicId?: string;
    secondaryBotName?: string;
    autoSyncFollowers: boolean;
  };
  facebook: {
    enabled: boolean;
    pageName: string;
    pageId?: string;
    pageAccessToken?: string;
  };
  instagram: {
    enabled: boolean;
    accountHandle: string;
    igBusinessId?: string;
    accessToken?: string;
  };
  telegram: {
    enabled: boolean;
    botUsername: string;
    botToken?: string;
    lastUpdateId?: number;
  };
}

export interface SocialChannelLiveStatus {
  channel: SocialChannel;
  connected: boolean;
  modeLabel: string;
  accountName: string;
  details?: string;
  avatarUrl?: string;
  lastCheckedAt: string;
}

export interface QuickReplyTemplate {
  id: string;
  title: string;
  titleTh: string;
  category: 'greeting' | 'pickup' | 'ready' | 'delivery' | 'payment' | 'followup';
  textEn: string;
  textTh: string;
}

export const SOCIAL_CHANNEL_META: Record<
  SocialChannel,
  {
    label: string;
    shortLabel: string;
    color: string;
    bgLight: string;
    textColor: string;
    borderColor: string;
    badgeBg: string;
    placeholderId: string;
  }
> = {
  whatsapp: {
    label: 'WhatsApp',
    shortLabel: 'WhatsApp',
    color: '#25D366',
    bgLight: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    badgeBg: 'bg-[#25D366] text-white',
    placeholderId: 'Phone Number (e.g. +66 81 234 5678)',
  },
  line: {
    label: 'LINE Official Account',
    shortLabel: 'LINE OA',
    color: '#06C755',
    bgLight: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    badgeBg: 'bg-[#06C755] text-white',
    placeholderId: 'LINE User ID (U...) or @Handle',
  },
  facebook: {
    label: 'Facebook Messenger',
    shortLabel: 'Messenger',
    color: '#0084FF',
    bgLight: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    badgeBg: 'bg-[#0084FF] text-white',
    placeholderId: 'Facebook Profile Name or PSID',
  },
  instagram: {
    label: 'Instagram Direct',
    shortLabel: 'Instagram',
    color: '#E1306C',
    bgLight: 'bg-pink-50',
    textColor: 'text-pink-700',
    borderColor: 'border-pink-200',
    badgeBg: 'bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white',
    placeholderId: 'Instagram @username',
  },
  telegram: {
    label: 'Telegram',
    shortLabel: 'Telegram',
    color: '#229ED9',
    bgLight: 'bg-sky-50',
    textColor: 'text-sky-700',
    borderColor: 'border-sky-200',
    badgeBg: 'bg-[#229ED9] text-white',
    placeholderId: 'Telegram @username or Chat ID',
  },
  wechat: {
    label: 'WeChat',
    shortLabel: 'WeChat',
    color: '#07C160',
    bgLight: 'bg-teal-50',
    textColor: 'text-teal-700',
    borderColor: 'border-teal-200',
    badgeBg: 'bg-[#07C160] text-white',
    placeholderId: 'WeChat ID',
  },
};

export const COUNTRY_CODES_LIST = [
  { code: '66', label: '🇹🇭 Thailand (+66)', country: 'TH' },
  { code: '65', label: '🇸🇬 Singapore (+65)', country: 'SG' },
  { code: '60', label: '🇲🇾 Malaysia (+60)', country: 'MY' },
  { code: '852', label: '🇭🇰 Hong Kong (+852)', country: 'HK' },
  { code: '81', label: '🇯🇵 Japan (+81)', country: 'JP' },
  { code: '82', label: '🇰🇷 South Korea (+82)', country: 'KR' },
  { code: '86', label: '🇨🇳 China (+86)', country: 'CN' },
  { code: '886', label: '🇹🇼 Taiwan (+886)', country: 'TW' },
  { code: '61', label: '🇦🇺 Australia (+61)', country: 'AU' },
  { code: '44', label: '🇬🇧 United Kingdom (+44)', country: 'GB' },
  { code: '1', label: '🇺🇸 USA / Canada (+1)', country: 'US' },
  { code: '33', label: '🇫🇷 France (+33)', country: 'FR' },
  { code: '49', label: '🇩🇪 Germany (+49)', country: 'DE' },
  { code: '971', label: '🇦🇪 UAE (+971)', country: 'AE' },
  { code: '91', label: '🇮🇳 India (+91)', country: 'IN' },
  { code: '84', label: '🇻🇳 Vietnam (+84)', country: 'VN' },
  { code: '62', label: '🇮🇩 Indonesia (+62)', country: 'ID' },
  { code: '63', label: '🇵🇭 Philippines (+63)', country: 'PH' },
];

export const DEFAULT_QUICK_TEMPLATES: QuickReplyTemplate[] = [
  {
    id: 'tpl_greeting',
    title: 'Welcome Greeting',
    titleTh: 'ทักทายลูกค้า',
    category: 'greeting',
    textEn:
      'Hello {name}! 👋 Welcome to That Laundry Shop. How can we assist you with your laundry or dry cleaning today?',
    textTh:
      'สวัสดีค่ะคุณ {name} 👋 ร้าน That Laundry Shop ยินให้บริการค่ะ วันนี้ให้ทางร้านดูแลรับ-ส่งผ้าหรือซักแห้งรายการไหนดีคะ?',
  },
  {
    id: 'tpl_pickup',
    title: 'Pickup Scheduled',
    titleTh: 'นัดรับผ้า',
    category: 'pickup',
    textEn:
      '🧺 Hello {name}, our rider has been scheduled to pick up your laundry today. Please leave your laundry bag at the reception/lobby or with our rider upon arrival. Thank you!',
    textTh:
      '🧺 สวัสดีค่ะคุณ {name} ทางร้านได้นัดหมายไรเดอร์เข้าไปรับผ้าเรียบร้อยแล้วค่ะ สามารถฝากผ้าไว้ที่นิติบุคคล/ล็อบบี้ หรือส่งมอบให้ไรเดอร์ได้เลยนะคะ ขอบคุณค่ะ',
  },
  {
    id: 'tpl_ready',
    title: 'Laundry Ready',
    titleTh: 'ซักเสร็จพร้อมส่ง',
    category: 'ready',
    textEn:
      '✨ Good news {name}! Your laundry order is freshly cleaned, pressed, and ready for delivery. What time works best for drop-off today?',
    textTh:
      '✨ แจ้งเตือนค่ะคุณ {name}! ผ้าของคุณซัก-รีดเสร็จเรียบร้อยพร้อมจัดส่งแล้วค่ะ วันนี้สะดวกรับผ้าช่วงเวลาไหนดีคะ?',
  },
  {
    id: 'tpl_delivery',
    title: 'Rider Out for Delivery',
    titleTh: 'กำลังจัดส่งผ้า',
    category: 'delivery',
    textEn:
      '🚚 Hello {name}, our rider is now on the way to deliver your clean laundry! We will send a confirmation photo once delivered.',
    textTh:
      '🚚 สวัสดีค่ะคุณ {name} ขณะนี้ไรเดอร์กำลังนำผ้าที่ซักเสร็จแล้วไปส่งให้ค่ะ เมื่อจัดส่งเรียบร้อยจะมีรูปภาพยืนยันส่งให้อีกครั้งนะคะ',
  },
  {
    id: 'tpl_payment',
    title: 'Bill & Payment Reminder',
    titleTh: 'แจ้งยอดชำระเงิน',
    category: 'payment',
    textEn:
      '💳 Hello {name}, thank you for using That Laundry Shop! Kindly find your laundry bill details. You can pay via PromptPay QR or your Member Wallet. Please send the slip here once completed.',
    textTh:
      '💳 สวัสดีค่ะคุณ {name} ขอบคุณที่ใช้บริการ That Laundry Shop ค่ะ รบกวนตรวจสอบยอดค่าบริการ สามารถชำระผ่าน QR PromptPay หรือตัดบัตรสมาชิก แล้วส่งสลิปในแชทนี้ได้เลยนะคะ',
  },
  {
    id: 'tpl_stain_check',
    title: 'Special Garment / Stain Care',
    titleTh: 'แจ้งตรวจสอบคราบ/เนื้อผ้า',
    category: 'followup',
    textEn:
      '🔍 Hello {name}, our laundry specialist inspected your garments and noticed a delicate fabric/stain. Would you like us to proceed with our specialized stain treatment / dry cleaning?',
    textTh:
      '🔍 สวัสดีค่ะคุณ {name} ช่างซักได้ตรวจสอบเนื้อผ้าและพบคราบฝังแน่น/ผ้าชนิดพิเศษ คุณลูกค้าต้องการให้ทางร้านดูแลด้วยโปรแกรมขจัดคราบพิเศษหรือซักแห้งไหมคะ?',
  },
];
