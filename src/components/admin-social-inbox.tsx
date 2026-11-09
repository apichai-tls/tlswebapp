'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Plus,
  Search,
  Phone,
  CheckCheck,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Settings,
  UserCheck,
  Copy,
  Trash2,
  Image as ImageIcon,
  ShoppingBag,
  ChevronRight,
  Link2,
  CheckCircle2,
  MessageCircle,
  X,
  Zap,
  Paperclip,
  Smile,
  Reply,
  Volume2,
  VolumeX,
  Radio,
  AppWindow,
  Smartphone,
  Eye,
  Upload,
  QrCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  SocialChannel,
  SocialChannelConfig,
  SocialChannelLiveStatus,
  SocialConversation,
  SocialMessage,
  SocialMessageAttachment,
  SocialMessageReplyRef,
  SOCIAL_CHANNEL_META,
  COUNTRY_CODES_LIST,
  DEFAULT_QUICK_TEMPLATES,
  QuickReplyTemplate,
} from '@/types/social-inbox';
import {
  formatPhoneForWhatsApp,
  buildWhatsAppUrl,
  buildWhatsAppWebUrl,
  buildWhatsAppProtocolUrl,
  normalizePhoneKey,
  getChannelColorClasses,
} from '@/lib/social-helpers';
import {
  getSocialInboxDataAction,
  createWhatsAppChatAction,
  createMultiChannelChatAction,
  sendSocialMessageAction,
  recordInboundSocialMessageAction,
  updateSocialConversationAction,
  deleteSocialConversationAction,
  saveSocialChannelConfigAction,
  pollLiveChannelUpdatesAction,
  checkChannelsLiveStatusAction,
  startWhatsAppQrPairingAction,
  getWhatsAppQrStatusAction,
  disconnectWhatsAppQrAction,
} from '@/actions/social-inbox';
import type { WhatsAppQrState } from '@/lib/whatsapp-qr-manager';
import { syncLineOaFollowersAction } from '@/actions/line';

const QUICK_EMOJIS = [
  '👋',
  '🙏',
  '✨',
  '🧺',
  '👕',
  '👗',
  '🚚',
  '✅',
  '💳',
  '❤️',
  '😊',
  '👍',
  '🎉',
  '🫧',
  '🕒',
  '📍',
  '📸',
  '🧾',
  '🌟',
  '💐',
  '🔥',
  '💯',
  '🤝',
  '📞',
];

interface AdminSocialInboxProps {
  currentUser?: any;
  customers?: any[];
  jobs?: any[];
  shops?: any[];
  onCreateJobForCustomer?: (customer: any) => void;
  onEditJob?: (job: any) => void;
}

export function AdminSocialInbox({
  currentUser,
  customers = [],
  jobs = [],
  shops = [],
  onCreateJobForCustomer,
  onEditJob,
}: AdminSocialInboxProps) {
  const [conversations, setConversations] = useState<SocialConversation[]>([]);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [config, setConfig] = useState<SocialChannelConfig | null>(null);
  const [liveStatuses, setLiveStatuses] = useState<Record<
    SocialChannel,
    SocialChannelLiveStatus
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingLine, setSyncingLine] = useState(false);
  const [liveConnected, setLiveConnected] = useState(true);
  const [lastLiveSyncAt, setLastLiveSyncAt] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Filters & Selection
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<'all' | SocialChannel>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'open' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Native App Composer State
  const [composerText, setComposerText] = useState('');
  const [stagedAttachments, setStagedAttachments] = useState<SocialMessageAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [showAttachmentInput, setShowAttachmentInput] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<SocialMessageReplyRef | null>(null);
  const [showTemplatesBar, setShowTemplatesBar] = useState(true);
  const [templateLang, setTemplateLang] = useState<'en' | 'th' | 'both'>('en');
  const [openWaWebOnSend, setOpenWaWebOnSend] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Modal 1: Create New WhatsApp Chat
  const [isNewWhatsAppOpen, setIsNewWhatsAppOpen] = useState(false);
  const [waCustomerSearch, setWaCustomerSearch] = useState('');
  const [waSelectedCustomerId, setWaSelectedCustomerId] = useState<string>('');
  const [waCountryCode, setWaCountryCode] = useState('66');
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waContactName, setWaContactName] = useState('');
  const [waInitialMessage, setWaInitialMessage] = useState(
    'Hello! 👋 Welcome to That Laundry Shop. How can we assist you with your laundry today?'
  );
  const [waCreateCrmCustomer, setWaCreateCrmCustomer] = useState(true);
  const [creatingWaChat, setCreatingWaChat] = useState(false);

  // Modal 2: Create Multi-Channel Chat (LINE OA, Messenger, Instagram, Telegram)
  const [isNewSocialOpen, setIsNewSocialOpen] = useState(false);
  const [newSocialChannel, setNewSocialChannel] = useState<SocialChannel>('line');
  const [newSocialExtId, setNewSocialExtId] = useState('');
  const [newSocialName, setNewSocialName] = useState('');
  const [newSocialPhone, setNewSocialPhone] = useState('');
  const [newSocialCustomerId, setNewSocialCustomerId] = useState('');
  const [newSocialMessage, setNewSocialMessage] = useState('');
  const [creatingSocialChat, setCreatingSocialChat] = useState(false);

  // Modal 3: Link Conversation to CRM Customer
  const [isLinkCustomerOpen, setIsLinkCustomerOpen] = useState(false);
  const [linkCustomerSearch, setLinkCustomerSearch] = useState('');

  // Modal 4: Channel Settings & Webhook Configuration
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [waQrState, setWaQrState] = useState<WhatsAppQrState | null>(null);
  const [loadingWaQr, setLoadingWaQr] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevInboundMsgCountRef = useRef<number | null>(null);

  // Pleasant two-tone native chat chime using Web Audio API
  const playNotificationChime = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(880, now + 0.09); // A5
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.28);
    } catch {}
  }, [soundEnabled]);

  // Launch WhatsApp in Docked Companion Popup Window, Native App, or Web Tab
  const openWhatsAppBridgeWindow = useCallback(
    (phone: string, text?: string, preferredMode?: 'companion_popup' | 'native_app' | 'web_tab') => {
      const mode = preferredMode || config?.whatsapp?.launchTarget || 'companion_popup';
      const cc = config?.whatsapp?.defaultCountryCode || '66';

      if (mode === 'native_app') {
        const protoUrl = buildWhatsAppProtocolUrl(phone, text, cc);
        window.location.href = protoUrl;
        return;
      }

      if (mode === 'companion_popup') {
        const webUrl = buildWhatsAppWebUrl(phone, text, cc);
        const width = 520;
        const height = 760;
        const left = Math.max(0, window.screen.width - width - 30);
        const top = Math.max(0, (window.screen.height - height) / 2);
        window.open(
          webUrl,
          'tls_whatsapp_companion',
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no`
        );
        return;
      }

      const waUrl = buildWhatsAppUrl(phone, text, cc);
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    },
    [config]
  );

  // Load Inbox Data & Live Channel Health
  const loadInbox = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        else setRefreshing(true);

        const [res, healthRes, qrRes] = await Promise.all([
          getSocialInboxDataAction(),
          checkChannelsLiveStatusAction().catch(() => null),
          getWhatsAppQrStatusAction().catch(() => null),
        ]);
        if (qrRes?.success && qrRes.state) {
          setWaQrState(qrRes.state);
        }

        if (healthRes?.success && healthRes.statuses) {
          setLiveStatuses(healthRes.statuses);
        }

        if (res.success) {
          const nextMsgs = res.messages || [];
          const inboundCount = nextMsgs.filter((m) => m.direction === 'inbound').length;
          prevInboundMsgCountRef.current = inboundCount;

          setConversations(res.conversations || []);
          setMessages(nextMsgs);
          if (res.config) setConfig(res.config);
          setLiveConnected(true);
          setLastLiveSyncAt(
            new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );

          if (!selectedConvId && res.conversations && res.conversations.length > 0) {
            setSelectedConvId(res.conversations[0].id);
          }
        } else {
          if (!silent) toast.error(res.error || 'Failed to load social inbox');
        }
      } catch (e: any) {
        if (!silent) toast.error('Error loading inbox: ' + e.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedConvId]
  );

  useEffect(() => {
    loadInbox();
  }, []);

  // REAL-TIME LIVE POLLING LOOP (Every 3.5 seconds — works like native chat apps!)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await pollLiveChannelUpdatesAction();
        if (res.success && res.conversations && res.messages) {
          setLiveConnected(true);
          setLastLiveSyncAt(
            new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );

          const newInboundMsgs = res.messages.filter((m) => m.direction === 'inbound');
          if (
            prevInboundMsgCountRef.current !== null &&
            newInboundMsgs.length > prevInboundMsgCountRef.current
          ) {
            const latestInbound = newInboundMsgs[newInboundMsgs.length - 1];
            playNotificationChime();
            if (latestInbound) {
              const chLabel =
                SOCIAL_CHANNEL_META[latestInbound.channel]?.shortLabel || latestInbound.channel;
              toast.success(
                `💬 New ${chLabel} message from ${latestInbound.senderName}: "${latestInbound.text.slice(
                  0,
                  60
                )}"`
              );
            }
          }
          prevInboundMsgCountRef.current = newInboundMsgs.length;

          setConversations(res.conversations);
          setMessages(res.messages);
        }
      } catch {
        setLiveConnected(false);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [playNotificationChime]);

  // Active Conversation & Messages
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConvId) || null,
    [conversations, selectedConvId]
  );

  const activeMessages = useMemo(() => {
    if (!selectedConvId) return [];
    return messages
      .filter((m) => m.conversationId === selectedConvId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, selectedConvId]);

  // Mark conversation as read when selected
  useEffect(() => {
    if (activeConversation && activeConversation.unreadCount > 0) {
      updateSocialConversationAction({
        conversationId: activeConversation.id,
        markAsRead: true,
      }).then((res) => {
        if (res.success && res.conversations) {
          setConversations(res.conversations);
        }
      });
    }
  }, [selectedConvId, activeConversation?.unreadCount]);

  // Upload File / Image from Device or Clipboard (`Ctrl+V`)
  const uploadFileToChat = async (file: File) => {
    try {
      setUploadingFile(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entityType', 'system');
      fd.append('subType', 'chat');
      fd.append('entityId', 'social');

      const res = await fetch('/api/upload-local', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data?.publicUrl) {
        const isImg =
          file.type.startsWith('image/') ||
          /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(file.name || '');
        setStagedAttachments((prev) => [
          ...prev,
          {
            type: isImg ? 'image' : 'file',
            url: data.publicUrl,
            name: file.name || 'Chat Photo',
          },
        ]);
        toast.success(`Attached ${file.name || 'photo'} ready to send!`);
      } else {
        toast.error(data?.error || 'Failed to upload file');
      }
    } catch (e: any) {
      toast.error('Upload error: ' + e.message);
    } finally {
      setUploadingFile(false);
    }
  };

  // Handle Clipboard Paste (`Ctrl+V`) directly inside message composer
  const handleComposerPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await uploadFileToChat(file);
        }
        return;
      }
    }
  };

  // Channel Counts & Stats
  const stats = useMemo(() => {
    const unreadTotal = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    const byChannel: Record<string, number> = {
      all: conversations.length,
      whatsapp: 0,
      line: 0,
      facebook: 0,
      instagram: 0,
      telegram: 0,
      wechat: 0,
    };
    const unreadByChannel: Record<string, number> = {
      all: unreadTotal,
      whatsapp: 0,
      line: 0,
      facebook: 0,
      instagram: 0,
      telegram: 0,
      wechat: 0,
    };
    for (const c of conversations) {
      byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
      unreadByChannel[c.channel] = (unreadByChannel[c.channel] || 0) + (c.unreadCount || 0);
    }
    return { unreadTotal, byChannel, unreadByChannel };
  }, [conversations]);

  // Filtered Conversations List
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (channelFilter !== 'all' && c.channel !== channelFilter) return false;
      if (statusFilter === 'unread' && (!c.unreadCount || c.unreadCount === 0)) return false;
      if (statusFilter === 'open' && c.status !== 'open') return false;
      if (statusFilter === 'resolved' && c.status !== 'resolved') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = c.contactName?.toLowerCase().includes(q);
        const matchCust = c.customerName?.toLowerCase().includes(q);
        const matchPhone = c.contactPhone?.toLowerCase().includes(q);
        const matchExt = c.externalContactId?.toLowerCase().includes(q);
        const matchMsg = c.lastMessageText?.toLowerCase().includes(q);
        const matchMember = c.customerMemberId?.toLowerCase().includes(q);
        if (!matchName && !matchCust && !matchPhone && !matchExt && !matchMsg && !matchMember) {
          return false;
        }
      }
      return true;
    });
  }, [conversations, channelFilter, statusFilter, searchQuery]);

  // Open Official LINE OA Manager (chat.line.biz) in a Docked Companion Window & copy customer name for instant lookup
  const openLineOfficialChatCompanion = (contactName?: string) => {
    if (contactName && contactName !== 'LINE User') {
      try {
        navigator.clipboard.writeText(contactName);
        toast.success(`Copied "${contactName}" — paste in LINE OA Chat search to view pre-webhook history`);
      } catch {}
    }
    const width = 540;
    const height = Math.min(900, window.screen.availHeight - 40);
    const left = Math.max(0, window.screen.availWidth - width - 16);
    const top = 20;
    window.open(
      'https://chat.line.biz/',
      'tls_line_oa_companion',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  };

  // Helper to return a phone string only if it contains real digits (hides '-' or '--' placeholders)
  const getDisplayPhone = (raw?: string | null): string => {
    if (!raw) return '';
    const cleaned = String(raw).trim();
    return /\d{6,}/.test(cleaned) ? cleaned : '';
  };

  // Linked CRM Customer & Jobs for the Right Panel
  const linkedCustomer = useMemo(() => {
    if (!activeConversation) return null;
    if (activeConversation.customerId) {
      const found = customers.find((c) => c.id === activeConversation.customerId);
      if (found) return found;
    }
    if (activeConversation.channel === 'line' && activeConversation.externalContactId) {
      const byLineId = customers.find(
        (c) => (c.lineId || '').trim() === activeConversation.externalContactId.trim()
      );
      if (byLineId) return byLineId;
    }
    const pk = normalizePhoneKey(
      activeConversation.contactPhone || activeConversation.externalContactId
    );
    if (pk.length >= 8) {
      const byPhone = customers.find((c) => normalizePhoneKey(c.phone) === pk);
      if (byPhone) return byPhone;
    }
    if (activeConversation.contactName) {
      const normName = activeConversation.contactName.trim().toLowerCase();
      if (normName.length >= 2 && normName !== 'line user') {
        const byName = customers.find(
          (c) =>
            c.name?.trim().toLowerCase() === normName ||
            c.nickName?.trim().toLowerCase() === normName
        );
        if (byName) return byName;
      }
    }
    return null;
  }, [activeConversation, customers]);

  const customerJobs = useMemo(() => {
    if (!activeConversation) return [];
    const custId = linkedCustomer?.id || activeConversation.customerId;
    const custNameNorm = (
      linkedCustomer?.name ||
      activeConversation.customerName ||
      activeConversation.contactName ||
      ''
    )
      .trim()
      .toLowerCase();
    const pk = normalizePhoneKey(
      linkedCustomer?.phone ||
        activeConversation.contactPhone ||
        activeConversation.externalContactId
    );

    const matched = jobs.filter((j) => {
      if (custId && j.customerId === custId) return true;
      if (pk.length >= 8 && normalizePhoneKey(j.customerPhone) === pk) return true;
      if (
        custNameNorm.length >= 3 &&
        custNameNorm !== 'line user' &&
        j.customerName?.trim().toLowerCase() === custNameNorm
      ) {
        return true;
      }
      return false;
    });

    const seenIds = new Set(matched.map((j) => String(j.id)));
    const synthesizedFromChat: any[] = [];

    // Also extract any orders referenced directly inside the active chat timeline (#2026xxxx)
    for (let i = activeMessages.length - 1; i >= 0; i--) {
      const msg = activeMessages[i];
      const text = msg.text || '';
      const orderMatches = Array.from(text.matchAll(/#(202\d{5,10})/g));
      for (const m of orderMatches) {
        const orderId = m[1];
        if (seenIds.has(orderId)) continue;
        seenIds.add(orderId);

        const isDelivered = /delivered/i.test(text);
        const isProcessing = /processing|picked up|in progress/i.test(text);
        const locMatch = text.match(/Location:\s*([^\n]+)/i);
        const amtMatch = text.match(/(?:฿|THB\s*)([\d,]+(?:\.\d{1,2})?)/i);
        const firstImg = msg.attachments?.find((a) => a.type === 'image' && a.url)?.url;

        synthesizedFromChat.push({
          id: orderId,
          customerId: custId || undefined,
          customerName:
            linkedCustomer?.name || activeConversation.customerName || activeConversation.contactName,
          status: isDelivered ? 'delivered' : isProcessing ? 'processing' : 'completed',
          serviceType: locMatch ? locMatch[1].trim() : 'Laundry Service',
          dropoffLocation: locMatch ? locMatch[1].trim() : undefined,
          totalPrice: amtMatch ? Number(amtMatch[1].replace(/,/g, '')) : undefined,
          deliveryProofImageUrl: firstImg || undefined,
          createdAt: msg.createdAt,
        });
      }
    }

    return [...matched, ...synthesizedFromChat].slice(0, 8);
  }, [activeConversation, linkedCustomer, jobs, activeMessages]);

  // Filtered customers for WhatsApp modal picker
  const filteredWaCustomers = useMemo(() => {
    if (!waCustomerSearch.trim()) return customers.slice(0, 15);
    const q = waCustomerSearch.toLowerCase().trim();
    return customers
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.nickName?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.memberId?.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [customers, waCustomerSearch]);

  // Select CRM Customer inside New WhatsApp Modal
  const handleSelectCustomerForWhatsApp = (cust: any) => {
    setWaSelectedCustomerId(cust.id);
    setWaContactName(cust.name || '');
    const rawPhone = cust.phone || '';
    if (rawPhone.startsWith('+')) {
      const matchedCode = COUNTRY_CODES_LIST.find((cc) =>
        rawPhone.replace(/\D/g, '').startsWith(cc.code)
      );
      if (matchedCode) {
        setWaCountryCode(matchedCode.code);
        setWaPhoneInput(rawPhone.replace(/\D/g, '').slice(matchedCode.code.length));
      } else {
        setWaPhoneInput(rawPhone);
      }
    } else {
      setWaPhoneInput(rawPhone);
    }
  };

  // Start New WhatsApp Chat Handler
  const handleCreateWhatsAppChat = async (
    launchTarget?: 'none' | 'companion_popup' | 'native_app' | 'web_tab'
  ) => {
    if (!waPhoneInput.trim()) {
      toast.error('Please enter a phone number or select a customer');
      return;
    }

    const formattedTargetPhone = formatPhoneForWhatsApp(waPhoneInput, waCountryCode);
    const hasDirectApiConfigured =
      (config?.whatsapp?.mode === 'cloud_api' &&
        Boolean(config?.whatsapp?.phoneNumberId?.trim() && config?.whatsapp?.accessToken?.trim())) ||
      (config?.whatsapp?.mode === 'gateway_api' && Boolean(config?.whatsapp?.gatewayUrl?.trim()));

    // Open WhatsApp window synchronously BEFORE async server call so browser popup blocker never blocks it
    if (launchTarget && launchTarget !== 'none' && formattedTargetPhone && !hasDirectApiConfigured) {
      openWhatsAppBridgeWindow(formattedTargetPhone, waInitialMessage, launchTarget);
    }

    try {
      setCreatingWaChat(true);
      const res = await createWhatsAppChatAction({
        phone: waPhoneInput,
        countryCode: waCountryCode,
        contactName: waContactName,
        customerId: waSelectedCustomerId || null,
        initialMessage: waInitialMessage,
        createCrmCustomerIfNew: waCreateCrmCustomer && !waSelectedCustomerId,
      });

      if (res.success && res.conversation) {
        if (res.conversations) setConversations(res.conversations);
        if (res.messages) setMessages(res.messages);
        setSelectedConvId(res.conversation.id);
        setChannelFilter('all');
        setIsNewWhatsAppOpen(false);

        toast.success(`WhatsApp chat ready with ${res.conversation.contactName}`);

        // Reset modal fields
        setWaPhoneInput('');
        setWaContactName('');
        setWaSelectedCustomerId('');
      } else {
        toast.error(res.error || 'Failed to create WhatsApp chat');
      }
    } catch (e: any) {
      toast.error('Error creating WhatsApp chat: ' + e.message);
    } finally {
      setCreatingWaChat(false);
    }
  };

  // Start New Multi-Channel Chat Handler
  const handleCreateMultiChannelChat = async () => {
    if (!newSocialExtId.trim() && !newSocialName.trim()) {
      toast.error('Please enter customer name or social handle/ID');
      return;
    }

    try {
      setCreatingSocialChat(true);
      const res = await createMultiChannelChatAction({
        channel: newSocialChannel,
        externalContactId: newSocialExtId,
        contactName: newSocialName,
        contactPhone: newSocialPhone,
        customerId: newSocialCustomerId || null,
        initialMessage: newSocialMessage,
      });

      if (res.success && res.conversation) {
        if (res.conversations) setConversations(res.conversations);
        if (res.messages) setMessages(res.messages);
        setSelectedConvId(res.conversation.id);
        setIsNewSocialOpen(false);
        toast.success(`Created ${SOCIAL_CHANNEL_META[newSocialChannel].shortLabel} conversation!`);
        setNewSocialExtId('');
        setNewSocialName('');
        setNewSocialPhone('');
        setNewSocialMessage('');
      } else {
        toast.error((res as any).error || 'Failed to create chat');
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setCreatingSocialChat(false);
    }
  };

  // Send Message in Active Conversation
  const handleSendMessage = async (
    forceWhatsAppTarget?: 'companion_popup' | 'native_app' | 'web_tab'
  ) => {
    if (!activeConversation) return;

    const allAttachments: SocialMessageAttachment[] = [...stagedAttachments];
    if (attachmentUrl.trim()) {
      allAttachments.push({ type: 'image', url: attachmentUrl.trim(), name: 'Image Link' });
    }

    if (!composerText.trim() && allAttachments.length === 0) {
      return;
    }

    const textToSend = composerText.trim();
    const replyRef = replyingTo || undefined;

    const hasDirectWaApi =
      waQrState?.status === 'connected' ||
      (config?.whatsapp?.mode === 'cloud_api' &&
        Boolean(config?.whatsapp?.phoneNumberId?.trim() && config?.whatsapp?.accessToken?.trim())) ||
      (config?.whatsapp?.mode === 'gateway_api' && Boolean(config?.whatsapp?.gatewayUrl?.trim()));

    // Open WhatsApp window synchronously BEFORE async server call so browser popup blocker never blocks it
    if (
      activeConversation.channel === 'whatsapp' &&
      (forceWhatsAppTarget || (!hasDirectWaApi && openWaWebOnSend))
    ) {
      openWhatsAppBridgeWindow(
        activeConversation.externalContactId || activeConversation.contactPhone || '',
        textToSend,
        forceWhatsAppTarget || config?.whatsapp?.launchTarget || 'companion_popup'
      );
    }

    try {
      setSendingMsg(true);
      setComposerText('');
      setStagedAttachments([]);
      setAttachmentUrl('');
      setShowAttachmentInput(false);
      setShowEmojiPicker(false);
      setReplyingTo(null);

      const res = await sendSocialMessageAction({
        conversationId: activeConversation.id,
        text: textToSend,
        attachments: allAttachments,
        replyTo: replyRef,
      });

      if (res.success) {
        if (res.conversations) setConversations(res.conversations);
        if (res.messages) setMessages(res.messages);

        if (res.message?.externalError) {
          toast.warning(`Saved to chat log (API note: ${res.message.externalError})`);
        }
      } else {
        setComposerText(textToSend);
        setStagedAttachments(allAttachments);
        toast.error(res.error || 'Failed to send message');
      }
    } catch (e: any) {
      setComposerText(textToSend);
      toast.error('Error sending message: ' + e.message);
    } finally {
      setSendingMsg(false);
    }
  };

  // Apply Quick Template into Composer
  const handleApplyTemplate = (tpl: QuickReplyTemplate) => {
    const custName =
      linkedCustomer?.nickName ||
      linkedCustomer?.name ||
      activeConversation?.contactName ||
      'Customer';

    const en = tpl.textEn.replace(/\{name\}/g, custName);
    const th = tpl.textTh.replace(/\{name\}/g, custName);

    let text = en;
    if (templateLang === 'th') text = th;
    else if (templateLang === 'both') text = `${th}\n\n${en}`;

    setComposerText(text);
  };

  // Insert Job Status Update (+ Proof Photo if available) into Composer
  const handleInsertJobStatus = (job: any, includePhoto = false) => {
    const custName = job.customerName || activeConversation?.contactName || 'Customer';
    const statusLabel = (job.status || 'processing').toUpperCase().replace(/_/g, ' ');
    const priceText = job.totalPrice ? `฿${Number(job.totalPrice).toLocaleString()}` : '';
    const msg = `🧺 Laundry Order Update (#${job.id})\nCustomer: ${custName}\nStatus: ${statusLabel}${
      priceText ? `\nTotal Amount: ${priceText}` : ''
    }${job.dropoffLocation ? `\nDelivery Address: ${job.dropoffLocation}` : ''}\n\nThank you for choosing That Laundry Shop! 💚`;

    setComposerText(msg);

    if (includePhoto) {
      const rawProof = job.deliveryProofImageUrl || job.proofImageUrl;
      if (rawProof) {
        let firstPhoto = rawProof;
        try {
          const parsed = JSON.parse(rawProof);
          if (Array.isArray(parsed) && parsed[0]) firstPhoto = parsed[0];
        } catch {}
        if (typeof firstPhoto === 'string' && firstPhoto.trim()) {
          setStagedAttachments((prev) => [
            ...prev,
            {
              type: 'image',
              url: firstPhoto.trim(),
              name: `Order #${job.id} Photo`,
            },
          ]);
        }
      }
    }

    toast.success(`Inserted Order #${job.id} summary into chat composer`);
  };

  // Simulate Inbound Reply (for testing live notification & sound on localhost)
  const handleSimulateInboundReply = async () => {
    if (!activeConversation) return;
    const sampleReplies = [
      'Thank you! Could the rider please leave it with the condo juristic office?',
      'Got it! Here is my location pin and phone number. See you at 3 PM!',
      'สวัสดีค่ะ วันนี้ส่งซักอบพับ 1 ถุง และสูทซักแห้ง 2 ชุดนะคะ มารับได้เลยค่ะ',
      'Payment transferred via QR PromptPay! Thank you so much 🙏',
    ];
    const randomReply = sampleReplies[Math.floor(Math.random() * sampleReplies.length)];

    const res = await recordInboundSocialMessageAction({
      channel: activeConversation.channel,
      externalContactId: activeConversation.externalContactId,
      contactName: activeConversation.contactName,
      text: randomReply,
      customerId: activeConversation.customerId,
    });

    if (res.success) {
      playNotificationChime();
      if (res.conversations) setConversations(res.conversations);
      if (res.messages) setMessages(res.messages);
      toast.success(`💬 Live message received from ${activeConversation.contactName}`);
    }
  };

  // Sync LINE OA Followers
  const handleSyncLineFollowers = async () => {
    try {
      setSyncingLine(true);
      const res = await syncLineOaFollowersAction(500);
      if (res.success) {
        toast.success(
          res.syncedCount > 0
            ? `Synced ${res.syncedCount} new LINE OA followers (${res.linkedCustomerCount} newly linked to CRM)`
            : `All ${res.contacts.length.toLocaleString()} LINE OA contacts are already synced & up to date!`
        );
        await loadInbox(true);
      } else {
        toast.error(res.error || 'Could not sync LINE followers');
      }
    } catch (e: any) {
      toast.error('LINE sync error: ' + e.message);
    } finally {
      setSyncingLine(false);
    }
  };

  // Link Conversation to CRM Customer
  const handleLinkCustomer = async (customer: any) => {
    if (!activeConversation) return;
    const res = await updateSocialConversationAction({
      conversationId: activeConversation.id,
      customerId: customer.id,
    });
    if (res.success && res.conversations) {
      setConversations(res.conversations);
      setIsLinkCustomerOpen(false);
      toast.success(`Linked conversation to CRM customer: ${customer.name}`);
    } else {
      toast.error(res.error || 'Failed to link customer');
    }
  };

  // Toggle Conversation Status (Open vs Resolved)
  const handleToggleResolved = async () => {
    if (!activeConversation) return;
    const nextStatus = activeConversation.status === 'resolved' ? 'open' : 'resolved';
    const res = await updateSocialConversationAction({
      conversationId: activeConversation.id,
      status: nextStatus,
    });
    if (res.success && res.conversations) {
      setConversations(res.conversations);
      toast.success(`Marked conversation as ${nextStatus.toUpperCase()}`);
    }
  };

  // Delete Conversation
  const handleDeleteConversation = async (convId: string) => {
    if (!window.confirm('Delete this conversation thread and its history?')) return;
    const res = await deleteSocialConversationAction(convId);
    if (res.success) {
      setConversations(res.conversations || []);
      setMessages(res.messages || []);
      if (selectedConvId === convId) {
        setSelectedConvId(res.conversations?.[0]?.id || null);
      }
      toast.success('Conversation deleted');
    }
  };

  // Poll WhatsApp QR Status every 2s while Settings dialog is open
  useEffect(() => {
    if (!isSettingsOpen) return;
    let cancelled = false;
    const checkQr = async () => {
      try {
        const res = await getWhatsAppQrStatusAction();
        if (!cancelled && res.success && res.state) {
          setWaQrState((prev) => {
            if (prev?.status !== 'connected' && res.state.status === 'connected') {
              toast.success(`WhatsApp Linked Successfully: ${res.state.connectedName || ''} (${res.state.connectedPhone || ''})`);
              checkChannelsLiveStatusAction().then((h) => {
                if (h?.success) setLiveStatuses(h.statuses);
              }).catch(() => {});
            }
            return res.state;
          });
        }
      } catch {}
    };
    checkQr();
    const timer = setInterval(checkQr, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isSettingsOpen]);

  const handleStartWhatsAppQr = async (resetAuth = false) => {
    try {
      setLoadingWaQr(true);
      const res = await startWhatsAppQrPairingAction(resetAuth);
      if (res.success && res.state) {
        setWaQrState(res.state);
        if (res.state.status === 'connected') {
          toast.success(`Connected to WhatsApp (${res.state.connectedPhone || ''})`);
        } else {
          toast.info('Generating WhatsApp QR Code... Scan with your phone in a moment!');
        }
      }
    } catch (e: any) {
      toast.error('Failed to start WhatsApp QR: ' + e.message);
    } finally {
      setLoadingWaQr(false);
    }
  };

  const handleDisconnectWhatsAppQr = async () => {
    if (!window.confirm('Disconnect current WhatsApp linked device?')) return;
    try {
      setLoadingWaQr(true);
      const res = await disconnectWhatsAppQrAction();
      if (res.success && res.state) {
        setWaQrState(res.state);
        toast.success('WhatsApp device disconnected');
        const healthRes = await checkChannelsLiveStatusAction().catch(() => null);
        if (healthRes?.success) setLiveStatuses(healthRes.statuses);
      }
    } catch (e: any) {
      toast.error('Disconnect failed: ' + e.message);
    } finally {
      setLoadingWaQr(false);
    }
  };

  // Save Channel Config
  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      setSavingSettings(true);
      const res = await saveSocialChannelConfigAction(config);
      if (res.success) {
        toast.success('Omnichannel live settings saved!');
        setIsSettingsOpen(false);
        const healthRes = await checkChannelsLiveStatusAction().catch(() => null);
        if (healthRes?.success) setLiveStatuses(healthRes.statuses);
      } else {
        toast.error(res.error || 'Failed to save settings');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  // Live preview of formatted WhatsApp E.164 in the modal
  const liveFormattedWaPhone = useMemo(() => {
    return formatPhoneForWhatsApp(waPhoneInput, waCountryCode);
  }, [waPhoneInput, waCountryCode]);

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-5 space-y-3.5 w-full">
      {/* Hidden File Input for Native Photo/Document Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          for (const f of files) {
            await uploadFileToChat(f);
          }
          e.target.value = '';
        }}
      />

      {/* ================================================================ */}
      {/* 1. COMPACT OMNICHANNEL COMMAND HEADER & CHANNEL TABS              */}
      {/* ================================================================ */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white px-4 py-3.5 sm:px-5 sm:py-4 rounded-2xl shadow-lg border border-slate-800/80 relative overflow-hidden space-y-3">
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-radial from-emerald-500/15 via-transparent to-transparent pointer-events-none" />

        {/* Top Row: Title + Live Sync Status + Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 shadow-inner">
              <MessageSquare size={20} className="text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Omnichannel Live Chat Hub
                </h1>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      liveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  <span>LIVE SYNC {lastLiveSyncAt ? `• ${lastLiveSyncAt}` : ''}</span>
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/75 truncate">
                Official LINE OA (@thatlaundryshop) • WhatsApp • Messenger • Instagram • Telegram
              </p>
            </div>
          </div>

          {/* Primary Action Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              onClick={() => setIsNewWhatsAppOpen(true)}
              className="h-8 px-3 bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 font-black text-xs rounded-xl shadow-sm gap-1.5 cursor-pointer transition-all"
            >
              <Phone size={13} className="fill-slate-950" />
              <span>+ New WhatsApp</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsSettingsOpen(true);
                if (!waQrState || waQrState.status === 'disconnected') {
                  handleStartWhatsAppQr(false);
                }
              }}
              className={`h-8 px-2.5 font-bold text-xs rounded-xl gap-1.5 cursor-pointer ${
                waQrState?.status === 'connected'
                  ? 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-400/50 text-emerald-100'
                  : 'bg-white/12 hover:bg-white/20 border-white/20 text-white'
              }`}
              title="Link shop WhatsApp via QR Code (Free 100% 2-Way Live Sync)"
            >
              <QrCode size={13} className="text-[#25D366]" />
              <span>
                {waQrState?.status === 'connected'
                  ? `WA Linked (${waQrState.connectedPhone || 'Live'})`
                  : 'Link WhatsApp QR'}
              </span>
            </Button>

            <Button
              size="sm"
              onClick={() => setIsNewSocialOpen(true)}
              className="h-8 px-3 bg-white/12 hover:bg-white/20 border border-white/15 text-white font-bold text-xs rounded-xl gap-1.5 cursor-pointer transition-all"
            >
              <Plus size={13} />
              <span>+ Social Chat</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncLineFollowers}
              disabled={syncingLine}
              className="h-8 px-2.5 bg-[#06C755]/20 hover:bg-[#06C755]/30 border-[#06C755]/40 text-emerald-200 font-bold text-xs rounded-xl gap-1.5 cursor-pointer"
              title="Sync followers & live messages from LINE Official Account"
            >
              <RefreshCw size={13} className={syncingLine ? 'animate-spin' : ''} />
              <span>Sync LINE OA</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="h-8 w-8 p-0 bg-white/10 hover:bg-white/20 border-white/15 text-white rounded-xl cursor-pointer"
              title={soundEnabled ? 'Notification Sound ON' : 'Notification Sound Muted'}
            >
              {soundEnabled ? (
                <Volume2 size={13} className="text-emerald-300" />
              ) : (
                <VolumeX size={13} className="text-slate-400" />
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsSettingsOpen(true)}
              className="h-8 px-2.5 bg-white/10 hover:bg-white/20 border-white/15 text-white font-bold text-xs rounded-xl gap-1.5 cursor-pointer"
              title="Configure Live API Keys, WhatsApp Bridge & Webhooks"
            >
              <Settings size={13} />
              <span className="hidden sm:inline">Channels</span>
            </Button>
          </div>
        </div>

        {/* Bottom Row: Channel Filter Tabs + Compact Live Health Indicators */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 relative z-10">
          <div className="flex items-center gap-1 p-1 bg-black/25 backdrop-blur-md rounded-xl border border-white/10 w-fit max-w-full overflow-x-auto custom-scrollbar">
            {(
              [
                {
                  key: 'all',
                  label: 'All Channels',
                  count: stats.byChannel.all,
                  unread: stats.unreadByChannel.all,
                  dot: 'bg-white',
                },
                {
                  key: 'whatsapp',
                  label: 'WhatsApp',
                  count: stats.byChannel.whatsapp,
                  unread: stats.unreadByChannel.whatsapp,
                  dot: 'bg-[#25D366]',
                },
                {
                  key: 'line',
                  label: 'LINE OA',
                  count: stats.byChannel.line,
                  unread: stats.unreadByChannel.line,
                  dot: 'bg-[#06C755]',
                },
                {
                  key: 'facebook',
                  label: 'Messenger',
                  count: stats.byChannel.facebook,
                  unread: stats.unreadByChannel.facebook,
                  dot: 'bg-[#0084FF]',
                },
                {
                  key: 'instagram',
                  label: 'Instagram',
                  count: stats.byChannel.instagram,
                  unread: stats.unreadByChannel.instagram,
                  dot: 'bg-pink-500',
                },
                {
                  key: 'telegram',
                  label: 'Telegram',
                  count: stats.byChannel.telegram,
                  unread: stats.unreadByChannel.telegram,
                  dot: 'bg-[#229ED9]',
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setChannelFilter(tab.key as any)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${
                  channelFilter === tab.key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${tab.dot}`} />
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    channelFilter === tab.key
                      ? 'bg-slate-900 text-white'
                      : 'bg-white/15 text-white/90'
                  }`}
                >
                  {tab.count}
                </span>
                {tab.unread > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                    {tab.unread}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Compact Live API Badges */}
          {liveStatuses && (
            <div className="hidden xl:flex items-center gap-1.5 text-[10px]">
              {(['line', 'whatsapp'] as const).map((ch) => {
                const st = liveStatuses[ch];
                if (!st) return null;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/15 border border-white/10 text-emerald-100 font-semibold cursor-pointer whitespace-nowrap"
                    title={st.details || st.modeLabel}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="font-black text-white">
                      {SOCIAL_CHANNEL_META[ch].shortLabel}:
                    </span>
                    <span className="text-emerald-200">{st.modeLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* 2. MAIN 3-COLUMN OMNICHANNEL WORKSPACE                            */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* -------------------------------------------------------------- */}
        {/* LEFT COLUMN (3 cols): CONVERSATION LIST                        */}
        {/* -------------------------------------------------------------- */}
        <div className="lg:col-span-4 xl:col-span-3 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden h-[calc(100vh-195px)] min-h-[680px] max-h-[860px]">
          {/* Search & Status Tabs */}
          <div className="p-2.5 border-b border-slate-100 space-y-2 bg-slate-50/70">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer, +66 phone, LINE..."
                className="pl-8 pr-7 h-8.5 text-xs bg-white border-slate-200/90 rounded-xl shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-200/60 rounded-xl">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'unread', label: `Unread (${stats.unreadTotal})` },
                  { id: 'open', label: 'Open' },
                  { id: 'resolved', label: 'Resolved' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`py-1 px-1.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer whitespace-nowrap truncate ${
                    statusFilter === st.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations Scroll List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                <RefreshCw size={20} className="animate-spin mx-auto text-emerald-600" />
                <p>Connecting to live social channels...</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                  <MessageCircle size={24} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-extrabold text-slate-700">No conversations found</p>
                  <p className="text-[11px] text-slate-400">
                    Start a new WhatsApp chat or sync your LINE OA followers.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setIsNewWhatsAppOpen(true)}
                  className="h-8 px-3 bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 font-black text-[11px] rounded-xl gap-1.5"
                >
                  <Phone size={12} />
                  <span>+ Start WhatsApp Chat</span>
                </Button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                const chColors = getChannelColorClasses(conv.channel);
                const validPhone = getDisplayPhone(conv.contactPhone);

                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`px-3 py-2.5 cursor-pointer transition-all hover:bg-slate-50/90 relative ${
                      isSelected
                        ? 'bg-emerald-50/70 border-l-[3px] border-l-emerald-600'
                        : conv.unreadCount > 0
                        ? 'bg-sky-50/40'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Avatar + Channel Micro-Badge */}
                      <div className="relative shrink-0 mt-0.5">
                        {conv.contactAvatar ? (
                          <img
                            src={conv.contactAvatar}
                            alt={conv.contactName}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-2xs"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white font-black text-xs flex items-center justify-center shadow-2xs">
                            {(conv.contactName || 'C').slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 px-1.5 py-0.2 rounded-full text-[8px] font-black uppercase shadow-xs ring-1 ring-white ${chColors.badge}`}
                        >
                          {conv.channel === 'whatsapp'
                            ? 'WA'
                            : conv.channel === 'line'
                            ? 'LINE'
                            : conv.channel === 'facebook'
                            ? 'FB'
                            : conv.channel === 'instagram'
                            ? 'IG'
                            : 'TG'}
                        </span>
                      </div>

                      {/* Name, Preview & Compact Metadata */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <p
                            className={`text-xs truncate ${
                              conv.unreadCount > 0
                                ? 'font-black text-slate-950'
                                : 'font-bold text-slate-800'
                            }`}
                          >
                            {conv.contactName}
                          </p>
                          <span className="text-[10px] font-medium text-slate-400 shrink-0">
                            {(() => {
                              if (
                                conv.lastMessageText ===
                                  'Connected via LINE Official Account (@thatlaundryshop)' ||
                                conv.lastMessageAt === '2026-01-01T00:00:00.000Z'
                              ) {
                                return 'Follower';
                              }
                              const d = new Date(conv.lastMessageAt);
                              if (isNaN(d.getTime())) return '';
                              const now = new Date();
                              const isToday =
                                d.getFullYear() === now.getFullYear() &&
                                d.getMonth() === now.getMonth() &&
                                d.getDate() === now.getDate();
                              if (isToday) {
                                return d.toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                });
                              }
                              return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                            })()}
                          </span>
                        </div>

                        {/* Message Preview Line */}
                        <p
                          className={`text-[11px] truncate mt-0.5 ${
                            conv.unreadCount > 0
                              ? 'font-bold text-slate-900'
                              : 'text-slate-500'
                          }`}
                        >
                          {conv.lastMessageDirection === 'outbound' && (
                            <span className="text-emerald-600 font-bold mr-1">✓✓ You:</span>
                          )}
                          {conv.lastMessageText}
                        </p>

                        {/* Compact Bottom Row: Valid Phone + CRM Badge + Unread Count */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {validPhone && (
                            <span className="text-[10px] text-emerald-700 font-bold truncate max-w-[125px]">
                              {validPhone}
                            </span>
                          )}
                          {conv.customerId && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {conv.customerMemberId ? `#${conv.customerMemberId}` : 'CRM'}
                            </span>
                          )}
                          {conv.status === 'resolved' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                              Resolved
                            </span>
                          )}
                          {conv.unreadCount > 0 && (
                            <span className="ml-auto px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* CENTER COLUMN (6 cols): LIVE NATIVE CHAT CONSOLE                */}
        {/* -------------------------------------------------------------- */}
        <div
          className={`${
            showRightPanel ? 'lg:col-span-5 xl:col-span-6' : 'lg:col-span-8 xl:col-span-9'
          } bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden h-[calc(100vh-195px)] min-h-[680px] max-h-[860px]`}
        >
          {!activeConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 bg-slate-50/40">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shadow-inner">
                <MessageSquare size={32} />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-base font-black text-slate-800">
                  Select a Conversation or Start a New WhatsApp Chat
                </h3>
                <p className="text-xs text-slate-500">
                  Choose any customer thread on the left or click below to message a customer live
                  via WhatsApp, LINE OA, Messenger, Instagram, or Telegram.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setIsNewWhatsAppOpen(true)}
                  className="h-10 px-4 bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 font-black text-xs rounded-xl gap-2 cursor-pointer"
                >
                  <Phone size={15} />
                  <span>+ Start New WhatsApp Chat</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsNewSocialOpen(true)}
                  className="h-10 px-4 text-xs font-bold rounded-xl gap-1.5 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>+ New LINE / Social Chat</span>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Active Chat Header — Clean Single-Row Toolbar */}
              <div className="px-3.5 py-2.5 border-b border-slate-200/80 bg-white flex items-center justify-between gap-2 shrink-0">
                {/* Left: Avatar + Contact Info */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    {activeConversation.contactAvatar ? (
                      <img
                        src={activeConversation.contactAvatar}
                        alt={activeConversation.contactName}
                        className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-2xs"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shadow-2xs">
                        {(activeConversation.contactName || 'C').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white absolute -bottom-0.5 -right-0.5"
                      title="Live Channel Active"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-black text-slate-900 truncate max-w-[180px] sm:max-w-[240px]">
                        {activeConversation.contactName}
                      </h3>
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                          getChannelColorClasses(activeConversation.channel).badge
                        }`}
                      >
                        {SOCIAL_CHANNEL_META[activeConversation.channel].shortLabel}
                      </span>
                      {activeConversation.customerMemberId && (
                        <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200/70 px-1.5 py-0.2 rounded-md font-bold shrink-0">
                          #{activeConversation.customerMemberId}
                        </span>
                      )}
                      {liveStatuses?.[activeConversation.channel] && (
                        <span className="hidden xl:inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shrink-0">
                          <Radio size={9} className="text-emerald-600 animate-pulse" />
                          <span>{liveStatuses[activeConversation.channel].modeLabel}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 text-[10px] text-slate-500 mt-0.5 truncate">
                      {(() => {
                        const headerPhone =
                          getDisplayPhone(activeConversation.contactPhone) ||
                          getDisplayPhone(linkedCustomer?.phone) ||
                          (activeConversation.channel === 'whatsapp'
                            ? getDisplayPhone(`+${activeConversation.externalContactId}`)
                            : '');
                        if (!headerPhone) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(headerPhone);
                              toast.success(`Copied ${headerPhone}`);
                            }}
                            className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline cursor-pointer shrink-0"
                            title="Click to copy phone number"
                          >
                            <Phone size={10} />
                            <span>{headerPhone}</span>
                            <Copy size={9} />
                          </button>
                        );
                      })()}
                      {activeConversation.channel === 'line' && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(activeConversation.externalContactId);
                            toast.success('Copied LINE ID');
                          }}
                          className="text-[10px] text-slate-400 hover:text-slate-700 font-mono truncate cursor-pointer"
                          title="Click to copy LINE User ID"
                        >
                          UID: {activeConversation.externalContactId.slice(0, 10)}…
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Compact Non-Wrapping Action Toolbar */}
                <div className="flex items-center gap-1 shrink-0">
                  {activeConversation.channel === 'line' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openLineOfficialChatCompanion(activeConversation.contactName)}
                      className="h-7.5 px-2.5 text-[11px] font-bold border-emerald-300 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100 rounded-lg gap-1 cursor-pointer whitespace-nowrap"
                      title="Open Official LINE OA Manager (chat.line.biz) Companion Window"
                    >
                      <AppWindow size={12} />
                      <span className="hidden sm:inline">LINE OA Chat</span>
                    </Button>
                  )}

                  {(activeConversation.channel === 'whatsapp' ||
                    Boolean(
                      getDisplayPhone(activeConversation.contactPhone) ||
                        getDisplayPhone(linkedCustomer?.phone)
                    )) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        openWhatsAppBridgeWindow(
                          getDisplayPhone(activeConversation.contactPhone) ||
                            getDisplayPhone(linkedCustomer?.phone) ||
                            activeConversation.externalContactId,
                          composerText,
                          'companion_popup'
                        )
                      }
                      className="h-7.5 px-2.5 text-[11px] font-bold border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 rounded-lg gap-1 cursor-pointer whitespace-nowrap"
                      title="Open Docked WhatsApp Web Companion Window"
                    >
                      <Phone size={11} />
                      <span className="hidden md:inline">WhatsApp</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSimulateInboundReply}
                    className="h-7.5 px-2 text-[11px] font-bold border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg gap-1 cursor-pointer whitespace-nowrap"
                    title="Simulate incoming customer message"
                  >
                    <Zap size={12} className="text-amber-500" />
                    <span className="hidden 2xl:inline">Test Reply</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleToggleResolved}
                    className={`h-7.5 px-2.5 text-[11px] font-bold rounded-lg gap-1 cursor-pointer whitespace-nowrap ${
                      activeConversation.status === 'resolved'
                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 size={12} />
                    <span className="hidden sm:inline">
                      {activeConversation.status === 'resolved' ? 'Resolved' : 'Resolve'}
                    </span>
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteConversation(activeConversation.id)}
                    className="h-7.5 w-7.5 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                    title="Delete conversation"
                  >
                    <Trash2 size={13} />
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowRightPanel(!showRightPanel)}
                    className="h-7.5 w-7.5 p-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg hidden lg:flex items-center justify-center cursor-pointer"
                    title="Toggle Customer 360° & Orders Sidebar"
                  >
                    <ChevronRight
                      size={15}
                      className={`transition-transform ${showRightPanel ? '' : 'rotate-180'}`}
                    />
                  </Button>
                </div>
              </div>

              {/* Chat Messages Timeline */}
              <div
                className={`flex-1 overflow-y-auto px-4 py-3.5 space-y-3 custom-scrollbar ${
                  activeConversation.channel === 'whatsapp'
                    ? 'bg-[#f4f1ea]'
                    : activeConversation.channel === 'line'
                    ? 'bg-gradient-to-b from-[#eef3f9] to-[#f5f7fb]'
                    : 'bg-slate-50/80'
                }`}
              >
                {activeMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3 max-w-md mx-auto">
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-2xs border border-slate-200/80 flex items-center justify-center text-slate-400">
                      <MessageCircle size={24} />
                    </div>
                    <p className="text-xs font-bold text-slate-700">
                      No messages recorded in this thread yet with {activeConversation.contactName}.
                    </p>
                    {activeConversation.channel === 'line' ? (
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs text-left space-y-2 text-[11px] text-slate-600">
                        <p className="font-bold text-slate-800">
                          💡 Looking for older chat.line.biz messages?
                        </p>
                        <p className="leading-relaxed">
                          All <strong>new customer messages</strong>, <strong>replies sent from this hub</strong>, and <strong>LINE Delivery Notifications</strong> sync here live in real time. To view historical messages typed manually inside LINE&apos;s web console prior to webhook activation, open the docked companion below:
                        </p>
                        <div className="pt-1">
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => openLineOfficialChatCompanion(activeConversation.contactName)}
                            className="h-8 px-3 bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-[11px] rounded-lg gap-1.5 cursor-pointer"
                          >
                            <AppWindow size={13} />
                            <span>Open Official LINE OA Companion</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Send a greeting, photo, or quick laundry template below to start chatting!
                      </p>
                    )}
                  </div>
                ) : (
                  activeMessages.map((msg, msgIdx) => {
                    const isOutbound = msg.direction === 'outbound';
                    const msgDateObj = new Date(msg.createdAt);
                    const prevDateObj =
                      msgIdx > 0 ? new Date(activeMessages[msgIdx - 1].createdAt) : null;
                    const showDateDivider =
                      !prevDateObj ||
                      msgDateObj.toDateString() !== prevDateObj.toDateString();

                    const imageAttachments = (msg.attachments || []).filter(
                      (a) => a.type === 'image' && a.url
                    );
                    const fileAttachments = (msg.attachments || []).filter(
                      (a) => a.type !== 'image' && a.url
                    );

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateDivider && !isNaN(msgDateObj.getTime()) && (
                          <div className="flex items-center justify-center my-2">
                            <span className="px-3 py-0.5 rounded-full bg-slate-900/8 text-slate-600 text-[10px] font-bold tracking-wide shadow-2xs backdrop-blur-xs">
                              {msgDateObj.toLocaleDateString([], {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        )}

                        <div
                          className={`group flex flex-col ${
                            isOutbound ? 'items-end' : 'items-start'
                          }`}
                        >
                          {/* Sender & Timestamp Header */}
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[10px] font-bold text-slate-600">
                              {isOutbound
                                ? msg.senderName || 'That Laundry Shop'
                                : activeConversation.contactName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {msgDateObj.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>

                            {/* Hover Quick Actions: Reply & Copy */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setReplyingTo({
                                    messageId: msg.id,
                                    senderName: isOutbound
                                      ? msg.senderName || 'Staff'
                                      : activeConversation.contactName,
                                    text: msg.text,
                                  })
                                }
                                className="p-0.5 rounded hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 cursor-pointer"
                                title="Reply to this message"
                              >
                                <Reply size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.text || '');
                                  toast.success('Copied message text');
                                }}
                                className="p-0.5 rounded hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 cursor-pointer"
                                title="Copy message text"
                              >
                                <Copy size={10} />
                              </button>
                            </div>
                          </div>

                          {/* Message Bubble — High-Contrast Official LINE OA / WhatsApp Styling */}
                          <div
                            className={`max-w-[85%] sm:max-w-[74%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs whitespace-pre-wrap break-words ${
                              isOutbound
                                ? activeConversation.channel === 'whatsapp'
                                  ? 'bg-[#d9fdd3] text-slate-900 border border-emerald-300/70 rounded-tr-xs'
                                  : activeConversation.channel === 'line'
                                  ? 'bg-[#e5f9ed] text-slate-900 border border-[#a8e6c1] rounded-tr-xs'
                                  : 'bg-indigo-600 text-white rounded-tr-xs'
                                : 'bg-white text-slate-900 border border-slate-200/90 rounded-tl-xs'
                            }`}
                          >
                            {/* Quoted Reply Block if present */}
                            {msg.replyTo && (
                              <div
                                className={`mb-2 px-2.5 py-1.5 rounded-lg border-l-4 text-[10px] ${
                                  isOutbound &&
                                  activeConversation.channel !== 'whatsapp' &&
                                  activeConversation.channel !== 'line'
                                    ? 'bg-black/15 border-white/70 text-white/90'
                                    : 'bg-white/70 border-emerald-500 text-slate-600'
                                }`}
                              >
                                <p className="font-black">{msg.replyTo.senderName}</p>
                                <p className="truncate opacity-90">{msg.replyTo.text}</p>
                              </div>
                            )}

                            {msg.text && <div className="text-[12.5px] leading-relaxed">{msg.text}</div>}

                            {/* Clean Responsive Photo Grid for Image Attachments */}
                            {imageAttachments.length > 0 && (
                              <div
                                className={`${msg.text ? 'mt-2.5' : ''} ${
                                  imageAttachments.length >= 2
                                    ? 'grid grid-cols-2 gap-1.5 max-w-md'
                                    : 'inline-block'
                                }`}
                              >
                                {imageAttachments.map((att, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => setLightboxImageUrl(att.url || null)}
                                    className="relative group/img cursor-pointer overflow-hidden rounded-xl border border-black/10 bg-slate-100 shadow-2xs"
                                  >
                                    <img
                                      src={att.url}
                                      alt={att.name || 'Attachment'}
                                      className={
                                        imageAttachments.length >= 2
                                          ? 'w-full h-40 sm:h-44 object-cover transition-transform duration-200 group-hover/img:scale-[1.03]'
                                          : 'max-h-60 w-auto object-cover transition-transform duration-200 group-hover/img:scale-[1.02]'
                                      }
                                    />
                                    <span className="absolute bottom-1.5 right-1.5 bg-slate-900/75 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5 rounded-md opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1">
                                      <Eye size={10} /> View Full
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Other Non-Image File Attachments */}
                            {fileAttachments.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {fileAttachments.map((att, idx) => (
                                  <a
                                    key={idx}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-[11px] font-bold underline"
                                  >
                                    <Paperclip size={12} />
                                    <span>{att.name || 'Download Attachment'}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>

                          {isOutbound && (
                            <div className="flex items-center gap-1 mt-1 px-1 text-[9px] text-slate-500 font-semibold">
                              <CheckCheck size={11} className="text-emerald-600" />
                              <span>
                                {msg.deliveryMethod === 'line_api'
                                  ? 'Delivered Live via LINE OA API'
                                  : msg.deliveryMethod === 'whatsapp_cloud_api'
                                  ? 'Delivered Live via WhatsApp Cloud API'
                                  : msg.deliveryMethod === 'whatsapp_gateway_api'
                                  ? 'Delivered Live via WhatsApp Gateway'
                                  : msg.deliveryMethod === 'meta_graph_api'
                                  ? 'Delivered Live via Meta Graph API'
                                  : msg.deliveryMethod === 'telegram_bot_api'
                                  ? 'Delivered Live via Telegram Bot API'
                                  : msg.deliveryMethod === 'whatsapp_web_bridge'
                                  ? 'Sent • WhatsApp Bridge Active'
                                  : 'Delivered'}
                              </span>
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Compact Quick Laundry Templates Strip */}
              {showTemplatesBar && (
                <div className="px-3 py-1.5 bg-slate-50/95 border-t border-slate-200/80 flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1 shrink-0">
                    <Sparkles size={11} className="text-amber-500" />
                    <span className="hidden sm:inline">Templates</span>
                  </span>

                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1 custom-scrollbar">
                    {DEFAULT_QUICK_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl)}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200/90 hover:border-emerald-300 text-[10px] font-bold text-slate-700 shrink-0 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                      >
                        {tpl.title}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-0.5 bg-slate-200/70 p-0.5 rounded-lg shrink-0">
                    {(['en', 'th', 'both'] as const).map((lng) => (
                      <button
                        key={lng}
                        type="button"
                        onClick={() => setTemplateLang(lng)}
                        className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase cursor-pointer ${
                          templateLang === lng
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {lng === 'both' ? 'TH+EN' : lng.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Replying-To Quote Preview Bar */}
              {replyingTo && (
                <div className="px-3 py-1.5 bg-emerald-50/90 border-t border-emerald-200 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Reply size={13} className="text-emerald-600 shrink-0" />
                    <div className="text-xs min-w-0">
                      <span className="font-black text-emerald-900 mr-1.5">
                        Replying to {replyingTo.senderName}:
                      </span>
                      <span className="text-slate-600 truncate inline-block max-w-md align-bottom">
                        {replyingTo.text}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Staged Uploaded Photos / Attachments Preview Bar */}
              {stagedAttachments.length > 0 && (
                <div className="px-3 py-2 bg-indigo-50/70 border-t border-indigo-200 flex items-center gap-2 overflow-x-auto shrink-0">
                  {stagedAttachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="relative group rounded-xl border border-indigo-200 bg-white p-1.5 flex items-center gap-2 shrink-0 shadow-2xs"
                    >
                      {att.type === 'image' && att.url ? (
                        <img
                          src={att.url}
                          alt={att.name || 'Preview'}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <Paperclip size={15} className="text-indigo-600" />
                      )}
                      <span className="text-[11px] font-bold text-slate-700 max-w-[120px] truncate">
                        {att.name || 'Photo'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setStagedAttachments((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-0.5 rounded-full bg-rose-500 text-white hover:bg-rose-600 cursor-pointer"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Optional Image URL Input Strip */}
              {showAttachmentInput && (
                <div className="px-3 py-1.5 bg-sky-50/70 border-t border-sky-200 flex items-center gap-2 shrink-0">
                  <ImageIcon size={14} className="text-sky-600 shrink-0" />
                  <Input
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                    placeholder="Paste an image URL (https://...)..."
                    className="h-7.5 text-xs bg-white rounded-lg flex-1"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAttachmentUrl('');
                      setShowAttachmentInput(false);
                    }}
                    className="h-7 w-7 p-0 text-slate-400"
                  >
                    <X size={13} />
                  </Button>
                </div>
              )}

              {/* Emoji Picker Popover Strip */}
              {showEmojiPicker && (
                <div className="px-3 py-1.5 bg-white border-t border-slate-200 flex flex-wrap items-center gap-1 shrink-0">
                  {QUICK_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setComposerText((prev) => `${prev}${em}`)}
                      className="w-7.5 h-7.5 rounded-lg hover:bg-slate-100 text-base flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}

              {/* Message Composer Footer */}
              <div className="p-2.5 bg-white border-t border-slate-200/90 space-y-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  {/* Upload Photo/File from Computer */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadingFile}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9.5 w-9.5 p-0 rounded-xl border-slate-200 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 shrink-0 cursor-pointer"
                    title="Upload photo or slip from computer (or paste screenshot with Ctrl+V)"
                  >
                    {uploadingFile ? (
                      <RefreshCw size={15} className="animate-spin text-emerald-600" />
                    ) : (
                      <Upload size={15} />
                    )}
                  </Button>

                  {/* Emoji Picker Toggle */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`h-9.5 w-9.5 p-0 rounded-xl border-slate-200 shrink-0 cursor-pointer ${
                      showEmojiPicker
                        ? 'bg-amber-50 border-amber-300 text-amber-600'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Insert Emoji"
                  >
                    <Smile size={15} />
                  </Button>

                  {/* Paste Image Link Toggle */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAttachmentInput(!showAttachmentInput)}
                    className="h-9.5 w-9.5 p-0 rounded-xl border-slate-200 text-slate-500 hover:text-slate-800 shrink-0 cursor-pointer hidden sm:flex"
                    title="Attach image via URL"
                  >
                    <ImageIcon size={15} />
                  </Button>

                  <textarea
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    onPaste={handleComposerPaste}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={1}
                    placeholder={`Message ${activeConversation.contactName} via ${
                      SOCIAL_CHANNEL_META[activeConversation.channel].shortLabel
                    }... (Enter to send • Ctrl+V to paste photo)`}
                    className="flex-1 min-h-[38px] max-h-24 rounded-xl border border-slate-200 bg-slate-50/90 focus:bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                  />

                  {activeConversation.channel === 'whatsapp' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSendMessage('companion_popup')}
                      disabled={
                        sendingMsg ||
                        (!composerText.trim() &&
                          stagedAttachments.length === 0 &&
                          !attachmentUrl.trim())
                      }
                      className="h-9.5 px-3 bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 font-black text-xs rounded-xl gap-1.5 shrink-0 cursor-pointer shadow-2xs"
                      title="Send & Open in Docked WhatsApp Live Window"
                    >
                      <AppWindow size={13} />
                      <span className="hidden sm:inline">Send & WA</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSendMessage()}
                    disabled={
                      sendingMsg ||
                      (!composerText.trim() &&
                        stagedAttachments.length === 0 &&
                        !attachmentUrl.trim())
                    }
                    className="h-9.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl gap-1.5 shrink-0 cursor-pointer shadow-2xs"
                  >
                    <Send size={13} />
                    <span>Send</span>
                  </Button>
                </div>

                {activeConversation.channel === 'whatsapp' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 px-1">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={openWaWebOnSend}
                        onChange={(e) => setOpenWaWebOnSend(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Auto-sync to Docked WhatsApp Companion on Enter</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openWhatsAppBridgeWindow(
                            activeConversation.externalContactId,
                            composerText,
                            'companion_popup'
                          )
                        }
                        className="text-emerald-700 font-bold hover:underline cursor-pointer"
                      >
                        Companion Popup
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() =>
                          openWhatsAppBridgeWindow(
                            activeConversation.externalContactId,
                            composerText,
                            'native_app'
                          )
                        }
                        className="text-emerald-700 font-bold hover:underline cursor-pointer"
                      >
                        Desktop/Mobile App
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* -------------------------------------------------------------- */}
        {/* RIGHT COLUMN (3 cols): CUSTOMER 360° CRM & LAUNDRY ORDERS       */}
        {/* -------------------------------------------------------------- */}
        {showRightPanel && (
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden h-[calc(100vh-195px)] min-h-[680px] max-h-[860px]">
            <div className="px-3.5 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <UserCheck size={15} className="text-indigo-600" />
                <span>Customer 360° & Orders</span>
              </span>
              {activeConversation && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsLinkCustomerOpen(true)}
                  className="h-7 px-2 text-[10px] font-bold rounded-lg gap-1 cursor-pointer bg-white"
                >
                  <Link2 size={11} />
                  <span>{linkedCustomer ? 'Change Link' : 'Link CRM'}</span>
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar">
              {!activeConversation ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  Select a conversation to view customer profile and active laundry orders.
                </p>
              ) : (
                <>
                  {/* Customer Profile Card */}
                  {linkedCustomer ? (
                    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-indigo-50/30 p-3.5 space-y-2.5 shadow-2xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 block">
                            Verified CRM Member
                          </span>
                          <h4 className="text-sm font-black text-slate-900 truncate">
                            {linkedCustomer.name}
                          </h4>
                          {linkedCustomer.nickName && (
                            <p className="text-[11px] text-slate-500 font-semibold truncate">
                              Nickname: {linkedCustomer.nickName}
                            </p>
                          )}
                        </div>
                        {linkedCustomer.memberId && (
                          <Badge className="bg-indigo-600 text-white text-[10px] font-mono shrink-0">
                            #{linkedCustomer.memberId}
                          </Badge>
                        )}
                      </div>

                      {/* Wallet & Full Non-Truncated Phone */}
                      <div className="grid grid-cols-1 gap-1.5 pt-0.5">
                        <div className="flex items-center justify-between bg-white rounded-lg px-2.5 py-2 border border-indigo-100/80">
                          <span className="text-[10px] font-bold uppercase text-slate-400">
                            Wallet Balance
                          </span>
                          <span className="text-xs font-black text-emerald-700">
                            ฿
                            {Number(
                              linkedCustomer.creditBalance ?? linkedCustomer.walletBalance ?? 0
                            ).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between bg-white rounded-lg px-2.5 py-2 border border-indigo-100/80 gap-2">
                          <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">
                            Phone
                          </span>
                          {getDisplayPhone(linkedCustomer.phone) ||
                          getDisplayPhone(activeConversation.contactPhone) ? (
                            <button
                              type="button"
                              onClick={() => {
                                const ph =
                                  getDisplayPhone(linkedCustomer.phone) ||
                                  getDisplayPhone(activeConversation.contactPhone);
                                navigator.clipboard.writeText(ph);
                                toast.success(`Copied ${ph}`);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-800 hover:text-emerald-700 cursor-pointer"
                              title="Click to copy phone"
                            >
                              <span>
                                {getDisplayPhone(linkedCustomer.phone) ||
                                  getDisplayPhone(activeConversation.contactPhone)}
                              </span>
                              <Copy size={10} className="text-slate-400" />
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-slate-400">
                              Not provided
                            </span>
                          )}
                        </div>
                      </div>

                      {onCreateJobForCustomer && (
                        <Button
                          size="sm"
                          onClick={() => onCreateJobForCustomer(linkedCustomer)}
                          className="w-full h-8.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Plus size={13} />
                          <span>+ Create Laundry Job for Customer</span>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center space-y-2 bg-slate-50/50">
                      <p className="text-xs font-bold text-slate-700">Not linked to CRM Customer</p>
                      <p className="text-[11px] text-slate-500">
                        Link this social profile to an existing customer to view their orders &
                        wallet.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsLinkCustomerOpen(true)}
                        className="h-8 px-3 text-xs font-bold rounded-lg gap-1.5 cursor-pointer bg-white"
                      >
                        <Link2 size={13} />
                        <span>Link to CRM Customer</span>
                      </Button>
                    </div>
                  )}

                  {/* Quick Channel Actions */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Live App Launchers
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                      {activeConversation.channel === 'line' && (
                        <button
                          type="button"
                          onClick={() =>
                            openLineOfficialChatCompanion(activeConversation.contactName)
                          }
                          className="flex items-center justify-between px-3 py-2 rounded-xl border border-[#06C755]/40 bg-[#06C755]/10 hover:bg-[#06C755]/15 text-xs font-bold text-emerald-950 transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <AppWindow size={13} className="text-[#06C755]" />
                            <span>Official LINE OA Chat Companion</span>
                          </span>
                          <ExternalLink size={12} className="text-emerald-700" />
                        </button>
                      )}

                      {(Boolean(
                        getDisplayPhone(activeConversation.contactPhone) ||
                          getDisplayPhone(linkedCustomer?.phone)
                      ) ||
                        activeConversation.channel === 'whatsapp') && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              openWhatsAppBridgeWindow(
                                getDisplayPhone(activeConversation.contactPhone) ||
                                  getDisplayPhone(linkedCustomer?.phone) ||
                                  activeConversation.externalContactId,
                                composerText,
                                'companion_popup'
                              )
                            }
                            className="flex items-center justify-between px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-xs font-bold text-emerald-900 transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              <AppWindow size={13} className="text-emerald-600" />
                              <span>Docked WhatsApp Web Companion</span>
                            </span>
                            <ExternalLink size={12} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openWhatsAppBridgeWindow(
                                getDisplayPhone(activeConversation.contactPhone) ||
                                  getDisplayPhone(linkedCustomer?.phone) ||
                                  activeConversation.externalContactId,
                                composerText,
                                'native_app'
                              )
                            }
                            className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800 transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              <Smartphone size={13} className="text-emerald-600" />
                              <span>Open Native WhatsApp App</span>
                            </span>
                            <ExternalLink size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Customer's Laundry Orders */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <ShoppingBag size={12} /> Recent Laundry Orders ({customerJobs.length})
                      </span>
                    </div>

                    {customerJobs.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic py-3 text-center">
                        No recent laundry orders found for this contact.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {customerJobs.map((job) => {
                          const hasProofPhoto = Boolean(
                            job.deliveryProofImageUrl || job.proofImageUrl
                          );
                          return (
                            <div
                              key={job.id}
                              className="p-2.5 rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-white transition-all space-y-1.5 shadow-2xs"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  onClick={() => onEditJob && onEditJob(job)}
                                  className="font-mono text-xs font-black text-indigo-700 hover:underline cursor-pointer"
                                >
                                  #{job.id}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] font-bold uppercase px-1.5 py-0 ${
                                    job.status === 'delivered' || job.status === 'completed'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}
                                >
                                  {job.status}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                                <span className="truncate">{job.serviceType || 'Laundry'}</span>
                                {job.totalPrice !== undefined && Number(job.totalPrice) > 0 && (
                                  <span className="font-black text-slate-900 shrink-0">
                                    ฿{Number(job.totalPrice).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-1 gap-1 pt-0.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleInsertJobStatus(job, hasProofPhoto)}
                                  className="w-full h-7 text-[10px] font-bold rounded-lg gap-1 bg-white border-slate-200 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 cursor-pointer"
                                >
                                  <Send size={10} />
                                  <span>
                                    {hasProofPhoto
                                      ? 'Insert Order + Proof Photo'
                                      : 'Insert Order Update'}
                                  </span>
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* FULL-SCREEN IMAGE LIGHTBOX MODAL                                 */}
      {/* ================================================================ */}
      <Dialog open={Boolean(lightboxImageUrl)} onOpenChange={() => setLightboxImageUrl(null)}>
        <DialogContent className="sm:max-w-3xl rounded-2xl p-3 bg-slate-950 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Chat Media Preview</span>
              {lightboxImageUrl && (
                <a
                  href={lightboxImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline text-xs flex items-center gap-1 mr-6"
                >
                  <ExternalLink size={12} /> Open Original
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          {lightboxImageUrl && (
            <div className="flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={lightboxImageUrl}
                alt="Full preview"
                className="max-h-[70vh] w-auto rounded-xl object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/* MODAL 1: START NEW WHATSAPP CHAT VIA PLATFORM                    */}
      {/* ================================================================ */}
      <Dialog open={isNewWhatsAppOpen} onOpenChange={setIsNewWhatsAppOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
          <DialogHeader className="bg-gradient-to-r from-[#075E54] via-[#128C7E] to-[#25D366] text-white p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-xs">
                <Phone size={22} className="text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-black text-white">
                  Start New WhatsApp Chat (เปิดแชท WhatsApp ใหม่)
                </DialogTitle>
                <p className="text-xs text-emerald-50 mt-0.5">
                  Select an existing CRM customer or enter any phone number to start a live
                  WhatsApp conversation immediately.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
            {/* Step 1: Pick Existing CRM Customer (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>1. Select CRM Customer (ค้นหาลูกค้าจากระบบ หรือกรอกเบอร์ใหม่ด้านล่าง)</span>
                {waSelectedCustomerId && (
                  <button
                    type="button"
                    onClick={() => {
                      setWaSelectedCustomerId('');
                      setWaContactName('');
                      setWaPhoneInput('');
                    }}
                    className="text-[10px] text-rose-600 font-bold hover:underline"
                  >
                    Clear Selection
                  </button>
                )}
              </label>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  value={waCustomerSearch}
                  onChange={(e) => setWaCustomerSearch(e.target.value)}
                  placeholder="Search customer by name, nickname, phone, or member ID..."
                  className="pl-8 h-9 text-xs rounded-xl"
                />
              </div>
              {waCustomerSearch.trim() && (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
                  {filteredWaCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        handleSelectCustomerForWhatsApp(c);
                        setWaCustomerSearch('');
                      }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-emerald-50 flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div>
                        <span className="font-bold text-slate-900">{c.name}</span>
                        {c.nickName && (
                          <span className="text-slate-500 ml-1">({c.nickName})</span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] font-bold text-emerald-700">
                        {c.phone || 'No phone'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Country Code & Phone Number */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200/80">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Country Code</label>
                <select
                  value={waCountryCode}
                  onChange={(e) => setWaCountryCode(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800"
                >
                  {COUNTRY_CODES_LIST.map((cc) => (
                    <option key={cc.code} value={cc.code}>
                      {cc.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>WhatsApp Phone Number *</span>
                  {liveFormattedWaPhone && (
                    <span className="font-mono text-[10px] text-emerald-700 font-bold">
                      +{liveFormattedWaPhone}
                    </span>
                  )}
                </label>
                <Input
                  value={waPhoneInput}
                  onChange={(e) => setWaPhoneInput(e.target.value)}
                  placeholder="e.g. 081-234-5678 or 812345678"
                  className="h-9 text-xs bg-white font-mono font-bold rounded-xl"
                />
              </div>

              <div className="sm:col-span-3 space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  Customer / Contact Name (ชื่อลูกค้า)
                </label>
                <Input
                  value={waContactName}
                  onChange={(e) => setWaContactName(e.target.value)}
                  placeholder="e.g. Khun Mint (Room 1204)"
                  className="h-9 text-xs bg-white rounded-xl"
                />
              </div>

              {!waSelectedCustomerId && (
                <div className="sm:col-span-3 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waCreateCrmCustomer}
                      onChange={(e) => setWaCreateCrmCustomer(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>
                      Automatically save as a new Customer in CRM if phone number is not registered
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Step 3: Initial Message & Quick Templates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Initial Message (ข้อความเริ่มต้น)
                </label>
                <span className="text-[10px] text-slate-400">Click a template to autofill</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      const targetName = waContactName.trim() || 'Customer';
                      setWaInitialMessage(tpl.textEn.replace(/\{name\}/g, targetName));
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 border border-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
              <textarea
                value={waInitialMessage}
                onChange={(e) => setWaInitialMessage(e.target.value)}
                rows={3}
                placeholder="Type the first message to send on WhatsApp..."
                className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsNewWhatsAppOpen(false)}
              className="h-9 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={creatingWaChat}
                onClick={() => handleCreateWhatsAppChat('none')}
                className="h-9 px-3 text-xs font-bold rounded-xl border-slate-300 cursor-pointer"
              >
                Create in Inbox
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={creatingWaChat}
                onClick={() => handleCreateWhatsAppChat('native_app')}
                className="h-9 px-3 text-xs font-bold rounded-xl border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 gap-1 cursor-pointer"
              >
                <Smartphone size={13} />
                <span>WhatsApp App</span>
              </Button>

              <Button
                type="button"
                disabled={creatingWaChat}
                onClick={() => handleCreateWhatsAppChat('companion_popup')}
                className="h-9 px-4 bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 font-black text-xs rounded-xl gap-1.5 cursor-pointer shadow-md"
              >
                <AppWindow size={14} />
                <span>Start & Open Live Companion</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/* MODAL 2: START NEW MULTI-CHANNEL SOCIAL CHAT                     */}
      {/* ================================================================ */}
      <Dialog open={isNewSocialOpen} onOpenChange={setIsNewSocialOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
          <DialogHeader className="bg-slate-900 text-white p-5">
            <DialogTitle className="text-base font-black text-white">
              Start New Social Channel Conversation
            </DialogTitle>
            <p className="text-xs text-slate-300 mt-0.5">
              Connect with a customer live via LINE OA, Facebook Messenger, Instagram Direct, or
              Telegram.
            </p>
          </DialogHeader>

          <div className="p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Social Channel *</label>
              <select
                value={newSocialChannel}
                onChange={(e) => setNewSocialChannel(e.target.value as SocialChannel)}
                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"
              >
                <option value="line">LINE Official Account (@thatlaundryshop)</option>
                <option value="facebook">Facebook Messenger</option>
                <option value="instagram">Instagram Direct (@thatlaundryshop)</option>
                <option value="telegram">Telegram</option>
                <option value="wechat">WeChat</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Customer Name *</label>
              <Input
                value={newSocialName}
                onChange={(e) => setNewSocialName(e.target.value)}
                placeholder="e.g. Khun Nat / @username"
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                {SOCIAL_CHANNEL_META[newSocialChannel].placeholderId}
              </label>
              <Input
                value={newSocialExtId}
                onChange={(e) => setNewSocialExtId(e.target.value)}
                placeholder={SOCIAL_CHANNEL_META[newSocialChannel].placeholderId}
                className="h-9 text-xs rounded-xl font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Initial Message</label>
              <textarea
                value={newSocialMessage}
                onChange={(e) => setNewSocialMessage(e.target.value)}
                rows={3}
                placeholder="Write a message..."
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={() => setIsNewSocialOpen(false)}
              className="h-9 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button
              disabled={creatingSocialChat}
              onClick={handleCreateMultiChannelChat}
              className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl"
            >
              Create Conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/* MODAL 3: LINK CONVERSATION TO CRM CUSTOMER                       */}
      {/* ================================================================ */}
      <Dialog open={isLinkCustomerOpen} onOpenChange={setIsLinkCustomerOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-black">
              Link Conversation to CRM Customer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={linkCustomerSearch}
              onChange={(e) => setLinkCustomerSearch(e.target.value)}
              placeholder="Search customer by name, phone, or member ID..."
              className="h-9 text-xs rounded-xl"
            />
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {customers
                .filter((c) => {
                  if (!linkCustomerSearch.trim()) return true;
                  const q = linkCustomerSearch.toLowerCase();
                  return (
                    c.name?.toLowerCase().includes(q) ||
                    c.phone?.toLowerCase().includes(q) ||
                    c.memberId?.toLowerCase().includes(q)
                  );
                })
                .slice(0, 25)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleLinkCustomer(c)}
                    className="w-full p-2.5 text-left text-xs hover:bg-indigo-50 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{c.name}</p>
                      <p className="text-[10px] text-slate-500">{c.phone || 'No phone'}</p>
                    </div>
                    {c.memberId && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        #{c.memberId}
                      </Badge>
                    )}
                  </button>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ================================================================ */}
      {/* MODAL 4: LIVE CHANNEL SETTINGS & API / BRIDGE CONFIGURATION      */}
      {/* ================================================================ */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Radio size={18} className="text-emerald-600" />
              <span>Omnichannel Live App & API Configuration</span>
            </DialogTitle>
          </DialogHeader>

          {config && (
            <div className="space-y-4 text-xs">
              {/* 1. WhatsApp Live Configuration */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-emerald-900 text-sm">
                    1. WhatsApp Live Integration
                  </span>
                  <Badge className="bg-[#25D366] text-slate-950 font-black">
                    {waQrState?.status === 'connected'
                      ? `QR Linked: ${waQrState.connectedPhone || 'Active'}`
                      : liveStatuses?.whatsapp?.modeLabel || 'Live Active'}
                  </Badge>
                </div>

                {/* Built-in Direct WhatsApp QR Link (Free 100% 2-Way Live Sync) */}
                <div className="p-3.5 rounded-xl bg-white border border-emerald-200 shadow-2xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <QrCode size={15} className="text-emerald-600" />
                        <span className="font-black text-slate-900 text-xs">
                          Direct WhatsApp QR Link (สแกน QR ผูกเบอร์ร้าน — ฟรี 100%)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        เปิดแอป WhatsApp ในมือถือร้าน → <strong>Linked Devices (อุปกรณ์ที่เชื่อมต่อ)</strong> → <strong>Link a Device</strong> แล้วสแกน QR ด้านล่าง ข้อความเข้า-ออกและรูปภาพจะซิงค์สดอัตโนมัติ!
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {waQrState?.status === 'connected' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={loadingWaQr}
                          onClick={handleDisconnectWhatsAppQr}
                          className="h-8 px-3 text-[11px] font-bold text-rose-600 border-rose-200 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          Disconnect
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={loadingWaQr}
                          onClick={() => handleStartWhatsAppQr(true)}
                          className="h-8 px-3 bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 font-black text-[11px] rounded-lg gap-1.5 cursor-pointer"
                        >
                          <RefreshCw size={12} className={loadingWaQr ? 'animate-spin' : ''} />
                          <span>
                            {waQrState?.status === 'qr_ready'
                              ? 'Refresh QR Code'
                              : 'Generate QR Code'}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {waQrState?.status === 'connected' && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-900">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <div>
                          <p className="font-black text-xs">
                            Connected: {waQrState.connectedName || 'WhatsApp Business'}{' '}
                            {waQrState.connectedPhone ? `(${waQrState.connectedPhone})` : ''}
                          </p>
                          <p className="text-[10px] text-emerald-700">
                            2-Way Live Sync Active — ทั้งข้อความที่ลูกค้าทักมา และข้อความที่แอดมินตอบทั้งบนเว็บ/ในมือถือจะซิงค์เข้าหน้านี้ทันที
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {waQrState?.status === 'connecting' && !waQrState.qrDataUrl && (
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-slate-600 text-xs font-bold">
                      <RefreshCw size={14} className="animate-spin text-emerald-600" />
                      <span>กำลังสร้าง QR Code สำหรับเชื่อมต่อ WhatsApp... รอสักครู่ครับ</span>
                    </div>
                  )}

                  {waQrState?.qrDataUrl && waQrState.status !== 'connected' && (
                    <div className="flex flex-col sm:flex-row items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs shrink-0">
                        <img
                          src={waQrState.qrDataUrl}
                          alt="WhatsApp Link QR Code"
                          className="w-48 h-48 object-contain"
                        />
                      </div>
                      <div className="space-y-2 text-[11px] text-slate-600">
                        <p className="font-black text-slate-900 text-xs">
                          วิธีสแกนเชื่อมต่อ (ทำครั้งเดียว):
                        </p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>เปิดแอป <strong>WhatsApp</strong> หรือ <strong>WhatsApp Business</strong> บนมือถือ</li>
                          <li>กดเมนูมุมขวาบน (หรือ Settings) → เลือก <strong>Linked Devices (อุปกรณ์ที่เชื่อมต่อ)</strong></li>
                          <li>กดปุ่ม <strong>Link a Device (เชื่อมต่ออุปกรณ์)</strong></li>
                          <li>นำกล้องมาสแกน QR Code นี้ เมื่อสแกนสำเร็จสถานะจะเปลี่ยนเป็นสีเขียวทันที!</li>
                        </ol>
                      </div>
                    </div>
                  )}

                  {waQrState?.lastError && (
                    <p className="text-[11px] text-rose-600 font-semibold">
                      ⚠️ {waQrState.lastError}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="font-bold text-slate-700">Live Dispatch Mode</label>
                    <select
                      value={config.whatsapp.mode}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          whatsapp: {
                            ...config.whatsapp,
                            mode: e.target.value as 'web_bridge' | 'cloud_api' | 'gateway_api',
                          },
                        })
                      }
                      className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 font-bold"
                    >
                      <option value="web_bridge">
                        Live WhatsApp Companion Window / Native App Bridge
                      </option>
                      <option value="cloud_api">
                        Meta WhatsApp Business Cloud API (graph.facebook.com)
                      </option>
                      <option value="gateway_api">
                        WhatsApp QR / REST Gateway API (WAHA / Evolution / UltraMsg)
                      </option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Default Country Code</label>
                    <Input
                      value={config.whatsapp.defaultCountryCode}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          whatsapp: { ...config.whatsapp, defaultCountryCode: e.target.value },
                        })
                      }
                      placeholder="66"
                      className="h-9 bg-white font-mono"
                    />
                  </div>
                </div>

                {config.whatsapp.mode === 'web_bridge' && (
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">
                      Preferred WhatsApp App Launch Target
                    </label>
                    <select
                      value={config.whatsapp.launchTarget || 'companion_popup'}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          whatsapp: {
                            ...config.whatsapp,
                            launchTarget: e.target.value as
                              | 'companion_popup'
                              | 'native_app'
                              | 'web_tab',
                          },
                        })
                      }
                      className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 font-bold"
                    >
                      <option value="companion_popup">
                        Docked Companion Popup Window (Side-by-Side WhatsApp Web)
                      </option>
                      <option value="native_app">
                        Installed WhatsApp Desktop / Mobile App (whatsapp:// protocol)
                      </option>
                      <option value="web_tab">New Browser Tab (wa.me)</option>
                    </select>
                  </div>
                )}

                {config.whatsapp.mode === 'cloud_api' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700">Meta Phone Number ID</label>
                      <Input
                        value={config.whatsapp.phoneNumberId || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            whatsapp: { ...config.whatsapp, phoneNumberId: e.target.value },
                          })
                        }
                        placeholder="e.g. 10592837465..."
                        className="h-8 bg-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700">Cloud API Access Token</label>
                      <Input
                        type="password"
                        value={config.whatsapp.accessToken || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            whatsapp: { ...config.whatsapp, accessToken: e.target.value },
                          })
                        }
                        placeholder="EAAG..."
                        className="h-8 bg-white font-mono"
                      />
                    </div>
                  </div>
                )}

                {config.whatsapp.mode === 'gateway_api' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700">
                        Gateway Send Endpoint URL
                      </label>
                      <Input
                        value={config.whatsapp.gatewayUrl || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            whatsapp: { ...config.whatsapp, gatewayUrl: e.target.value },
                          })
                        }
                        placeholder="https://your-waha-gateway/api/sendText"
                        className="h-8 bg-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700">Gateway API Key / Token</label>
                      <Input
                        type="password"
                        value={config.whatsapp.gatewayApiKey || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            whatsapp: { ...config.whatsapp, gatewayApiKey: e.target.value },
                          })
                        }
                        placeholder="API Key..."
                        className="h-8 bg-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 2. LINE OA Live Configuration */}
              <div className="p-4 rounded-xl border border-green-200 bg-green-50/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-green-900 text-sm">
                    2. LINE Official Account (@thatlaundryshop & @050ehvzb)
                  </span>
                  <Badge className="bg-[#06C755] text-white font-bold">
                    {liveStatuses?.line?.accountName || 'Verified Live API'}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600">
                  Both text messages and uploaded/pasted photos are pushed live to the
                  customer&apos;s LINE app via the LINE Messaging API. Customer replies, photos, and
                  stickers arrive automatically via{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded border font-mono">
                    /api/webhooks/line
                  </code>
                  .
                </p>
              </div>

              {/* 3. Facebook Messenger & Instagram Direct Live Graph API */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-blue-950 text-sm">
                    3. Facebook Messenger & Instagram Direct (Meta Graph API)
                  </span>
                  <Badge className="bg-[#0084FF] text-white font-bold">
                    {config.facebook.pageAccessToken ? 'Live Graph API' : 'Webhook Ready'}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600">Facebook Page Name</label>
                    <Input
                      value={config.facebook.pageName}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          facebook: { ...config.facebook, pageName: e.target.value },
                        })
                      }
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600">
                      Page Access Token (for live outbound push)
                    </label>
                    <Input
                      type="password"
                      value={config.facebook.pageAccessToken || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          facebook: { ...config.facebook, pageAccessToken: e.target.value },
                        })
                      }
                      placeholder="EAA..."
                      className="h-8 text-xs bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600">Instagram Handle</label>
                    <Input
                      value={config.instagram.accountHandle}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          instagram: { ...config.instagram, accountHandle: e.target.value },
                        })
                      }
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600">
                      Instagram Access Token (optional if using Page Token)
                    </label>
                    <Input
                      type="password"
                      value={config.instagram.accessToken || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          instagram: { ...config.instagram, accessToken: e.target.value },
                        })
                      }
                      placeholder="EAA..."
                      className="h-8 text-xs bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Telegram Bot Live Polling & Push */}
              <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sky-950 text-sm">
                    4. Telegram Bot API (Live 3s Polling & Push)
                  </span>
                  <Badge className="bg-[#229ED9] text-white font-bold">
                    {config.telegram.botToken ? 'Live Polling Active' : 'Ready'}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600">Bot Username</label>
                    <Input
                      value={config.telegram.botUsername}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          telegram: { ...config.telegram, botUsername: e.target.value },
                        })
                      }
                      placeholder="@ThatLaundryShopBot"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600">
                      Telegram BotFather Token (works live even on localhost!)
                    </label>
                    <Input
                      type="password"
                      value={config.telegram.botToken || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          telegram: { ...config.telegram, botToken: e.target.value },
                        })
                      }
                      placeholder="123456789:AAH..."
                      className="h-8 text-xs bg-white font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSettingsOpen(false)}
              className="h-9 text-xs font-bold rounded-xl"
            >
              Close
            </Button>
            <Button
              disabled={savingSettings}
              onClick={handleSaveConfig}
              className="h-9 px-4 bg-slate-900 text-white text-xs font-bold rounded-xl"
            >
              Save Live Channel Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
