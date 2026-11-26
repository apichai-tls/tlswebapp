'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import {
  MessageCircle,
  Send,
  Paperclip,
  RefreshCw,
  Phone,
  Check,
  CheckCheck,
  Loader2,
  Image as ImageIcon,
  Receipt,
  FileText,
  Sparkles,
  ExternalLink,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getClientAuthHeaders } from '@/lib/client-auth';
import { compressRiderImage } from '@/lib/rider-image-upload';
import {
  getCustomerJobChatThreadsAction,
  getConversationMessagesAction,
  sendSocialMessageAction,
  createWhatsAppChatAction,
  updateSocialConversationAction,
} from '@/actions/social-inbox';
import type {
  SocialChannel,
  SocialConversation,
  SocialMessage,
  SocialMessageAttachment,
} from '@/types/social-inbox';

export interface JobCustomerChatPanelProps {
  jobId?: string | null;
  jobDisplayId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  secondaryPhone?: string | null;
  lineUserId?: string | null;
  whatsappId?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  totalAmount?: number;
  billImageUrls?: string[];
}

const CHANNEL_META: Record<
  SocialChannel,
  { label: string; shortLabel: string; badgeClass: string; bubbleOutClass: string; dotClass: string }
> = {
  whatsapp: {
    label: 'WhatsApp',
    shortLabel: 'WA',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bubbleOutClass: 'bg-emerald-600 text-white',
    dotClass: 'bg-emerald-500',
  },
  line: {
    label: 'LINE OA',
    shortLabel: 'LINE',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
    bubbleOutClass: 'bg-[#06C755] text-white',
    dotClass: 'bg-[#06C755]',
  },
  email: {
    label: 'Gmail / Email',
    shortLabel: 'MAIL',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    bubbleOutClass: 'bg-[#EA4335] text-white',
    dotClass: 'bg-[#EA4335]',
  },
  facebook: {
    label: 'Messenger',
    shortLabel: 'FB',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    bubbleOutClass: 'bg-blue-600 text-white',
    dotClass: 'bg-blue-500',
  },
  instagram: {
    label: 'Instagram',
    shortLabel: 'IG',
    badgeClass: 'bg-pink-50 text-pink-700 border-pink-200',
    bubbleOutClass: 'bg-pink-600 text-white',
    dotClass: 'bg-pink-500',
  },
  telegram: {
    label: 'Telegram',
    shortLabel: 'TG',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    bubbleOutClass: 'bg-sky-600 text-white',
    dotClass: 'bg-sky-500',
  },
  wechat: {
    label: 'WeChat',
    shortLabel: 'WC',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    bubbleOutClass: 'bg-teal-600 text-white',
    dotClass: 'bg-teal-500',
  },
};

export function JobCustomerChatPanel({
  jobId,
  jobDisplayId,
  customerId,
  customerName,
  customerPhone,
  secondaryPhone,
  lineUserId,
  whatsappId,
  branchId,
  branchName,
  totalAmount = 0,
  billImageUrls = [],
}: JobCustomerChatPanelProps) {
  const [conversations, setConversations] = useState<SocialConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isStartingWa, setIsStartingWa] = useState(false);
  const [composerText, setComposerText] = useState('');
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<SocialMessageAttachment[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [chatFontScale, setChatFontScale] = useState<'md' | 'lg' | 'xl'>('lg');

  useEffect(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextH = Math.min(Math.max(el.scrollHeight, 100), 240);
    el.style.height = `${nextH}px`;
  }, [composerText, activeConversationId]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tls_job_chat_font_scale');
      if (saved === 'md' || saved === 'lg' || saved === 'xl') {
        setChatFontScale(saved);
      }
    } catch {}
  }, []);

  const cycleChatFontScale = () => {
    const next = chatFontScale === 'md' ? 'lg' : chatFontScale === 'lg' ? 'xl' : 'md';
    setChatFontScale(next);
    try {
      localStorage.setItem('tls_job_chat_font_scale', next);
    } catch {}
  };

  const messageTextClass =
    chatFontScale === 'xl'
      ? 'text-[16px] leading-relaxed'
      : chatFontScale === 'lg'
      ? 'text-[14.5px] leading-snug'
      : 'text-[13.5px] leading-snug';

  const activeConvIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || conversations[0] || null;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
    }, 60);
  }, []);

  const fetchThreads = useCallback(
    async (opts?: { silent?: boolean; preferredId?: string | null }) => {
      const hasCriteria = Boolean(
        (customerId && customerId.trim()) ||
          (customerPhone && customerPhone.trim()) ||
          (secondaryPhone && secondaryPhone.trim()) ||
          (lineUserId && lineUserId.trim()) ||
          (whatsappId && whatsappId.trim()) ||
          (customerName && customerName.trim().length >= 3)
      );
      if (!hasCriteria) {
        setConversations([]);
        setActiveConversationId(null);
        setMessages([]);
        return;
      }

      if (!opts?.silent) setIsLoading(true);
      try {
        const res = await getCustomerJobChatThreadsAction({
          customerId,
          customerPhone,
          secondaryPhone,
          customerName,
          lineUserId,
          whatsappId,
          preferredConversationId: opts?.preferredId ?? activeConvIdRef.current,
        });
        if (res.success) {
          setConversations(res.conversations);
          setActiveConversationId(res.activeConversationId ?? null);
          setMessages(res.messages);
          // Do NOT auto-mark conversations as read on initial panel open;
          // staff must explicitly click a thread or send a reply so shop staff viewing Edit Job never clear Unread badges accidentally.
        }
      } catch (err) {
        console.warn('[JobCustomerChatPanel] Failed to load threads:', err);
      } finally {
        if (!opts?.silent) setIsLoading(false);
      }
    },
    [customerId, customerPhone, secondaryPhone, customerName, lineUserId, whatsappId]
  );

  // Reload threads when customer changes (debounced 250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchThreads();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchThreads]);

  // Scroll to bottom when switching conversation or new message arrives
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('auto');
    }
  }, [activeConversationId, messages.length, scrollToBottom]);

  // Live SSE listener for instant inbound/echo messages while Edit Job is open
  useEffect(() => {
    const handleLiveSocialEvent = (evt: Event) => {
      const detail = (evt as CustomEvent).detail;
      if (!detail) return;
      const currentId = activeConvIdRef.current;

      if (detail.refreshRequired) {
        void fetchThreads({ silent: true, preferredId: currentId });
        return;
      }

      const incomingConv = detail.conversation as SocialConversation | undefined;
      const incomingMsg = detail.message as SocialMessage | undefined;

      if (incomingConv) {
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === incomingConv.id);
          if (!exists) return prev;
          return prev.map((c) => (c.id === incomingConv.id ? { ...c, ...incomingConv } : c));
        });
      }

      if (incomingMsg && currentId && incomingMsg.conversationId === currentId) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === incomingMsg.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...incomingMsg };
            return copy;
          }
          return [...prev, incomingMsg].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
      } else if (!incomingConv && !incomingMsg && detail.conversationId === currentId) {
        void fetchThreads({ silent: true, preferredId: currentId });
      }
    };

    window.addEventListener('tls:social-inbox-updated', handleLiveSocialEvent);
    const fallbackTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && activeConvIdRef.current) {
        void fetchThreads({ silent: true, preferredId: activeConvIdRef.current });
      }
    }, 10000);

    return () => {
      window.removeEventListener('tls:social-inbox-updated', handleLiveSocialEvent);
      clearInterval(fallbackTimer);
    };
  }, [fetchThreads]);

  const handleSelectThread = async (conv: SocialConversation) => {
    setActiveConversationId(conv.id);
    activeConvIdRef.current = conv.id;
    setIsLoading(true);
    try {
      const res = await getConversationMessagesAction(conv.id);
      if (res.success) {
        setMessages(res.messages);
      }
      if (conv.unreadCount > 0) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
        );
        void updateSocialConversationAction({
          conversationId: conv.id,
          markAsRead: true,
        }).catch(() => {});
      }
    } finally {
      setIsLoading(false);
    }
  };

  const uploadChatImageFile = async (file: File) => {
    setIsUploadingPhoto(true);
    let previewToRevoke = '';
    try {
      const compressed = await compressRiderImage(file, {
        fileName: `chat-${jobId || 'job'}-${Date.now()}`,
      });
      previewToRevoke = compressed.previewUrl;
      const actualContentType = compressed.file.type || 'image/jpeg';
      const subType = `chat-${Date.now()}`;
      const entityId = jobId || customerId || 'social';

      let uploadedUrl = '';
      try {
        const res = await fetch('/api/upload-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getClientAuthHeaders(),
          },
          body: JSON.stringify({
            entityType: 'job',
            entityId,
            subType,
            contentType: actualContentType,
          }),
        });
        if (!res.ok) throw new Error('Upload auth failed');
        const { uploadUrl, publicUrl, filePath } = await res.json();
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': actualContentType },
          body: compressed.file,
        });
        if (!putRes.ok) throw new Error('GCS PUT failed');
        uploadedUrl = publicUrl || filePath;
      } catch {
        const fd = new FormData();
        fd.append('file', compressed.file);
        fd.append('entityType', 'job');
        fd.append('entityId', entityId);
        fd.append('subType', subType);
        const fbRes = await fetch('/api/upload-local', {
          method: 'POST',
          headers: { ...getClientAuthHeaders() },
          body: fd,
        });
        if (!fbRes.ok) throw new Error('Upload fallback failed');
        const fbData = await fbRes.json();
        uploadedUrl = fbData.publicUrl;
      }

      if (uploadedUrl) {
        setPendingAttachments((prev) => [
          ...prev,
          { type: 'image', url: uploadedUrl, name: file.name || 'Photo.jpg' },
        ]);
      }
    } catch (err: any) {
      toast.error(`Failed to upload image: ${err?.message || 'Unknown error'}`);
    } finally {
      if (previewToRevoke && previewToRevoke.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(previewToRevoke);
        } catch {}
      }
      setIsUploadingPhoto(false);
    }
  };

  const handleSend = async () => {
    if (!activeConversation) return;
    const text = composerText.trim();
    if (!text && pendingAttachments.length === 0) return;

    const attachmentsToSend = [...pendingAttachments];
    setComposerText('');
    setPendingAttachments([]);
    setIsSending(true);

    // Optimistic message
    const tempId = `temp_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimisticMsg: SocialMessage = {
      id: tempId,
      conversationId: activeConversation.id,
      channel: activeConversation.channel,
      direction: 'outbound',
      senderName: 'Staff',
      text: text || (attachmentsToSend.length > 0 ? '📷 [Sent a photo]' : ''),
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      status: 'sent',
      createdAt: nowIso,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom('smooth');

    try {
      const res = await sendSocialMessageAction({
        conversationId: activeConversation.id,
        text,
        attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      });

      if (!res.success) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setComposerText(text);
        setPendingAttachments(attachmentsToSend);
        toast.error(res.error || 'Failed to send message');
        return;
      }

      if (res.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? (res.message as SocialMessage) : m))
        );
      }
      if (res.conversation) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversation.id ? (res.conversation as SocialConversation) : c
          )
        );
      }

      if ((res as any).deliveryWarning) {
        toast.warning((res as any).deliveryWarning);
      }
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setComposerText(text);
      setPendingAttachments(attachmentsToSend);
      toast.error(err?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleStartWhatsAppThread = async () => {
    const rawPhone = (customerPhone || secondaryPhone || whatsappId || '').trim();
    if (!rawPhone) {
      toast.error('Please enter a customer phone number first');
      return;
    }
    const primaryPhone = rawPhone.split(/[\/,;]+/)[0].trim();
    setIsStartingWa(true);
    try {
      const res = await createWhatsAppChatAction({
        phone: primaryPhone,
        contactName: customerName || primaryPhone,
        customerId: customerId || undefined,
        branchId: branchId || undefined,
        branchName: branchName || undefined,
        createCrmCustomerIfNew: false,
      });
      if (res.success && res.conversation) {
        setConversations((prev) => [
          res.conversation!,
          ...prev.filter((c) => c.id !== res.conversation!.id),
        ]);
        setActiveConversationId(res.conversation.id);
        setMessages(res.messages || []);
        toast.success('WhatsApp chat linked to this customer!');
      } else {
        toast.error(res.error || 'Could not start WhatsApp thread');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not start WhatsApp thread');
    } finally {
      setIsStartingWa(false);
    }
  };

  const getLatestProformaUrl = () => {
    const proformas = billImageUrls.filter((u) => u.toLowerCase().includes('proforma-'));
    if (proformas.length === 0) return null;
    if (proformas.length === 1) return proformas[0];
    return [...proformas].sort((a, b) => {
      const revA = Number(a.match(/-rev(\d+)/i)?.[1] || 0);
      const revB = Number(b.match(/-rev(\d+)/i)?.[1] || 0);
      return revB - revA;
    })[0];
  };

  const latestProformaImg = getLatestProformaUrl();
  const latestReceiptImg =
    [...billImageUrls].reverse().find((u) => u.toLowerCase().includes('receipt-')) || null;
  const latestOtherBillImg =
    [...billImageUrls].reverse().find((u) => {
      const lower = u.toLowerCase();
      return !lower.includes('proforma-') && !lower.includes('receipt-');
    }) || null;

  const handlePrepareBillSummary = (docType: 'inv' | 'rec' | 'bill' = 'bill') => {
    const orderTag = jobDisplayId ? `#${jobDisplayId}` : jobId ? `#${jobId}` : '';
    const amountStr =
      totalAmount > 0
        ? `฿${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
        : '';

    const targetImg =
      docType === 'inv'
        ? latestProformaImg
        : docType === 'rec'
          ? latestReceiptImg
          : latestReceiptImg || latestProformaImg || latestOtherBillImg;

    const fileLabel =
      docType === 'inv'
        ? `INV-${orderTag || 'Order'}.png`
        : docType === 'rec'
          ? `REC-${orderTag || 'Order'}.png`
          : `Bill-${orderTag || 'Order'}.png`;

    if (targetImg && !pendingAttachments.some((a) => a.url === targetImg)) {
      setPendingAttachments((prev) => [
        ...prev,
        { type: 'image', url: targetImg, name: fileLabel },
      ]);
    }

    const docLabel =
      docType === 'inv'
        ? 'Proforma Invoice (INV)'
        : docType === 'rec'
          ? 'Receipt (REC)'
          : 'laundry summary';
    const template = `Hello${customerName ? ` K.${customerName}` : ''}, here is the ${docLabel} for order ${orderTag}${amountStr ? ` (Total: ${amountStr})` : ''}. Thank you! 🙏`;
    setComposerText((prev) => (prev.trim() ? prev : template));
  };

  const handleOpenExternalWhatsApp = () => {
    const rawPhone =
      activeConversation?.contactPhone ||
      customerPhone ||
      secondaryPhone ||
      activeConversation?.externalContactId ||
      '';
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) {
      toast.error('No phone number available');
      return;
    }
    const normalized = digits.startsWith('0') ? `66${digits.slice(1)}` : digits;
    window.open(
      `https://web.whatsapp.com/send?phone=${normalized}`,
      'tls_whatsapp_companion',
      'width=1100,height=820,menubar=no,toolbar=no,location=no,status=no'
    );
  };

  const channelMeta = activeConversation
    ? CHANNEL_META[activeConversation.channel] || CHANNEL_META.whatsapp
    : CHANNEL_META.whatsapp;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col h-full min-h-[420px] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-200/90 bg-slate-50/80 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
              <MessageCircle size={15} />
            </div>
            <span className="text-sm font-extrabold text-slate-800 truncate">
              Customer Chat
            </span>
            {activeConversation && (
              <Badge
                variant="outline"
                className={`text-[11px] py-0 px-2 h-5 font-bold shrink-0 ${channelMeta.badgeClass}`}
              >
                {channelMeta.label}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cycleChatFontScale}
              className="h-7 px-2 text-[11px] font-extrabold border-slate-200 bg-white text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Change chat font size (ปรับขนาดตัวอักษรแชท)"
            >
              A{chatFontScale === 'xl' ? '++' : chatFontScale === 'lg' ? '+' : ''}
            </Button>
            {(activeConversation?.channel === 'whatsapp' || customerPhone) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenExternalWhatsApp}
                className="h-7 px-2.5 text-xs font-bold border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 rounded-lg gap-1 cursor-pointer"
                title="Open in WhatsApp Desktop / Web"
              >
                <Phone size={12} />
                <span>WA</span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fetchThreads({ preferredId: activeConversationId })}
              disabled={isLoading}
              className="h-7 w-7 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 cursor-pointer"
              title="Refresh chat"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* Channel Thread Switcher Pills (if customer has multiple channels e.g. WhatsApp + LINE OA) */}
        {conversations.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {conversations.map((conv) => {
              const meta = CHANNEL_META[conv.channel] || CHANNEL_META.whatsapp;
              const isSelected = conv.id === activeConversation?.id;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => handleSelectThread(conv)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                  <span>{meta.shortLabel}</span>
                  <span className="truncate max-w-[100px] opacity-90">
                    {conv.contactName || conv.contactPhone}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span className="px-1.5 rounded-full bg-rose-500 text-white text-[10px] leading-tight">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Active Contact Sub-header */}
        {activeConversation && (
          <div className="flex items-center justify-between gap-1.5 text-xs text-slate-500 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/70 flex-wrap">
            <span className="font-bold text-slate-800 truncate text-[13px]">
              {activeConversation.contactName}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {activeConversation.lastReadByName && (
                <span
                  className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200/80"
                  title={
                    activeConversation.lastReadAt
                      ? `Read at ${new Date(activeConversation.lastReadAt).toLocaleString()}`
                      : undefined
                  }
                >
                  👁️ {activeConversation.lastReadByName}
                </span>
              )}
              <span className="font-mono text-[11px] text-slate-500">
                {activeConversation.contactPhone ||
                  (activeConversation.channel === 'line'
                    ? 'LINE Official'
                    : activeConversation.externalContactId.slice(0, 14))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Messages Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[#f8fafc] min-h-0 flex flex-col">
        {isLoading && messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 py-8">
            <Loader2 size={22} className="animate-spin text-indigo-500" />
            <span className="text-sm font-medium">Loading customer chat...</span>
          </div>
        ) : !activeConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center">
              <MessageCircle size={22} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-700">
                No linked chat found yet
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                {customerName || customerPhone
                  ? `No existing WhatsApp or LINE OA history matched for ${customerName || customerPhone}.`
                  : 'Select or enter a customer to load their live chat history.'}
              </p>
            </div>
            {(customerPhone || secondaryPhone || whatsappId) && (
              <Button
                type="button"
                size="sm"
                disabled={isStartingWa}
                onClick={handleStartWhatsAppThread}
                className="h-9 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 shadow-xs cursor-pointer"
              >
                {isStartingWa ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <MessageCircle size={14} />
                )}
                <span>Start WhatsApp Chat</span>
              </Button>
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-slate-400 gap-1.5">
            <MessageCircle size={24} className="text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">Thread ready</p>
            <p className="text-xs text-slate-400">
              Send a message or bill summary below to start chatting with{' '}
              {activeConversation.contactName}.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOut = msg.direction === 'outbound';
            let timeLabel = '';
            try {
              timeLabel = format(new Date(msg.createdAt), 'dd/MM HH:mm');
            } catch {}

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 shadow-2xs ${
                    isOut
                      ? `${channelMeta.bubbleOutClass} rounded-br-xs`
                      : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs'
                  }`}
                >
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {msg.attachments.map((att, idx) =>
                        att.type === 'image' ? (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setLightboxImageUrl(att.url || null)}
                            className="relative rounded-xl overflow-hidden border border-black/10 bg-slate-100 max-w-[185px] max-h-[185px] cursor-pointer group"
                          >
                            <img
                              src={att.url}
                              alt={att.name || 'Attachment'}
                              className="object-cover max-h-[180px] w-auto group-hover:scale-105 transition-transform"
                            />
                          </button>
                        ) : (
                          <a
                            key={idx}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold underline ${
                              isOut ? 'bg-black/15 text-white' : 'bg-slate-100 text-indigo-700'
                            }`}
                          >
                            <ExternalLink size={12} />
                            <span className="truncate max-w-[150px]">
                              {att.name || 'Attachment'}
                            </span>
                          </a>
                        )
                      )}
                    </div>
                  )}

                  {msg.text && (
                    <p className={`whitespace-pre-wrap break-words ${messageTextClass}`}>
                      {msg.text}
                    </p>
                  )}

                  <div
                    className={`flex items-center justify-end gap-1 mt-1 text-[11px] ${
                      isOut ? 'text-white/85' : 'text-slate-400'
                    }`}
                  >
                    {isOut && msg.senderName && (
                      <span className="truncate max-w-[95px] font-medium">
                        {msg.senderName} •
                      </span>
                    )}
                    <span>{timeLabel}</span>
                    {isOut && (
                      <span>
                        {msg.status === 'read' ? (
                          <CheckCheck size={13} className="text-sky-200 inline" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck size={13} className="inline" />
                        ) : (
                          <Check size={13} className="inline" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions & Composer */}
      {activeConversation && (
        <div className="p-2.5 border-t border-slate-200/90 bg-white space-y-2 shrink-0">
          {/* Quick Templates Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {latestProformaImg && (
              <button
                type="button"
                onClick={() => handlePrepareBillSummary('inv')}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                title="Attach Proforma Invoice (INV) image & insert summary"
              >
                <FileText size={12} />
                <span>Send INV</span>
              </button>
            )}
            {latestReceiptImg && (
              <button
                type="button"
                onClick={() => handlePrepareBillSummary('rec')}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                title="Attach Receipt (REC) image & insert summary"
              >
                <Receipt size={12} />
                <span>Send REC</span>
              </button>
            )}
            {!latestProformaImg && !latestReceiptImg && (
              <button
                type="button"
                onClick={() => handlePrepareBillSummary('bill')}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                title="Insert order summary & attach bill image"
              >
                <Receipt size={12} />
                <span>Send Bill</span>
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setComposerText(
                  `Hello${customerName ? ` K.${customerName}` : ''}, our rider is on the way for your laundry. 🛵`
                )
              }
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shrink-0 cursor-pointer"
            >
              🛵 Rider On Way
            </button>
            <button
              type="button"
              onClick={() =>
                setComposerText(
                  `Hello${customerName ? ` K.${customerName}` : ''}, your laundry is clean and ready for delivery! ✨`
                )
              }
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shrink-0 cursor-pointer"
            >
              ✨ Ready
            </button>
          </div>

          {/* Pending Attachments Preview */}
          {pendingAttachments.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {pendingAttachments.map((att, idx) => {
                const lowerUrl = (att.url || '').toLowerCase();
                const docBadge = lowerUrl.includes('proforma-')
                  ? 'INV'
                  : lowerUrl.includes('receipt-')
                    ? 'REC'
                    : null;
                return (
                  <div
                    key={idx}
                    className="relative w-14 h-14 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shrink-0"
                  >
                    <img src={att.url} alt="Pending" className="w-full h-full object-cover" />
                    {docBadge && (
                      <span
                        className={`absolute bottom-0.5 left-0.5 px-1 py-0 rounded text-[9px] font-black leading-tight shadow ${
                          docBadge === 'INV'
                            ? 'bg-amber-500 text-white'
                            : 'bg-indigo-600 text-white'
                        }`}
                      >
                        {docBadge}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="absolute top-0.5 right-0.5 w-4.5 h-4.5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Input Bar — Full-width multi-line composer with bottom action bar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 focus-within:bg-white focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all overflow-hidden">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (e.target) e.target.value = '';
                if (f) void uploadChatImageFile(f);
              }}
            />

            <textarea
              ref={composerTextareaRef}
              rows={4}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                      e.preventDefault();
                      void uploadChatImageFile(file);
                      break;
                    }
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={`Message via ${channelMeta.label}...\n(Shift+Enter for new line • Ctrl+V to paste photo)`}
              className={`w-full min-h-[100px] max-h-[240px] ${
                composerText.length > 0 ? 'overflow-y-auto' : 'overflow-y-hidden'
              } text-sm leading-relaxed bg-transparent px-3 py-2.5 text-slate-800 placeholder:text-slate-400 focus:outline-none resize-y block`}
            />

            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-100/70 border-t border-slate-200/80">
              <div className="flex items-center gap-1.5 min-w-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploadingPhoto || isSending}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7.5 px-2.5 rounded-lg border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold gap-1.5 shrink-0 cursor-pointer"
                  title="Attach photo"
                >
                  {isUploadingPhoto ? (
                    <Loader2 size={13} className="animate-spin text-indigo-600" />
                  ) : (
                    <Paperclip size={13} />
                  )}
                  <span>Photo</span>
                </Button>
                <span className="text-[10px] text-slate-400 truncate hidden xl:inline">
                  Enter to send • Shift+Enter new line
                </span>
              </div>

              <Button
                type="button"
                size="sm"
                disabled={
                  isSending ||
                  isUploadingPhoto ||
                  (!composerText.trim() && pendingAttachments.length === 0)
                }
                onClick={() => void handleSend()}
                className="h-7.5 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shrink-0 cursor-pointer disabled:opacity-40"
                title="Send message"
              >
                {isSending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                <span>Send</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImageUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <button
              type="button"
              onClick={() => setLightboxImageUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg cursor-pointer"
            >
              <X size={16} />
            </button>
            <img
              src={lightboxImageUrl}
              alt="Chat preview"
              className="max-w-full max-h-[85vh] rounded-xl object-contain bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}
