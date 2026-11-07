'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Plus,
  Search,
  Phone,
  CheckCheck,
  Clock,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Settings,
  UserCheck,
  UserPlus,
  Copy,
  Check,
  Trash2,
  Image as ImageIcon,
  ShoppingBag,
  Wallet,
  Building2,
  Filter,
  ChevronRight,
  Globe,
  Link2,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  AtSign,
  Hash,
  X,
  Zap,
  FileText,
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
  SocialConversation,
  SocialMessage,
  SOCIAL_CHANNEL_META,
  COUNTRY_CODES_LIST,
  DEFAULT_QUICK_TEMPLATES,
  QuickReplyTemplate,
} from '@/types/social-inbox';
import {
  formatPhoneForWhatsApp,
  formatDisplayPhone,
  buildWhatsAppUrl,
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
} from '@/actions/social-inbox';
import { syncLineOaFollowersAction } from '@/actions/line';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingLine, setSyncingLine] = useState(false);

  // Filters & Selection
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<'all' | SocialChannel>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'open' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRightPanel, setShowRightPanel] = useState(true);

  // Message Composer State
  const [composerText, setComposerText] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [showAttachmentInput, setShowAttachmentInput] = useState(false);
  const [showTemplatesBar, setShowTemplatesBar] = useState(true);
  const [templateLang, setTemplateLang] = useState<'en' | 'th' | 'both'>('en');
  const [openWaWebOnSend, setOpenWaWebOnSend] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);

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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load Inbox Data
  const loadInbox = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const res = await getSocialInboxDataAction();
      if (res.success) {
        setConversations(res.conversations || []);
        setMessages(res.messages || []);
        if (res.config) setConfig(res.config);

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
  };

  useEffect(() => {
    loadInbox();
  }, []);

  // Scroll to bottom when active conversation or messages change
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
  }, [selectedConvId]);

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
    for (const c of conversations) {
      byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
    }
    return { unreadTotal, byChannel };
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

  // Linked CRM Customer & Jobs for the Right Panel
  const linkedCustomer = useMemo(() => {
    if (!activeConversation) return null;
    if (activeConversation.customerId) {
      const found = customers.find((c) => c.id === activeConversation.customerId);
      if (found) return found;
    }
    const pk = normalizePhoneKey(
      activeConversation.contactPhone || activeConversation.externalContactId
    );
    if (pk.length >= 8) {
      return customers.find((c) => normalizePhoneKey(c.phone) === pk) || null;
    }
    return null;
  }, [activeConversation, customers]);

  const customerJobs = useMemo(() => {
    if (!activeConversation) return [];
    const custId = linkedCustomer?.id || activeConversation.customerId;
    const pk = normalizePhoneKey(
      linkedCustomer?.phone ||
        activeConversation.contactPhone ||
        activeConversation.externalContactId
    );

    return jobs
      .filter((j) => {
        if (custId && j.customerId === custId) return true;
        if (pk.length >= 8 && normalizePhoneKey(j.customerPhone) === pk) return true;
        return false;
      })
      .slice(0, 8);
  }, [activeConversation, linkedCustomer, jobs]);

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
  const handleCreateWhatsAppChat = async (launchWhatsAppTab: boolean) => {
    if (!waPhoneInput.trim()) {
      toast.error('Please enter a phone number or select a customer');
      return;
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

        if (launchWhatsAppTab && res.whatsappUrl) {
          window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
        }

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
  const handleSendMessage = async (forceOpenWaWeb = false) => {
    if (!activeConversation) return;
    if (!composerText.trim() && !attachmentUrl.trim()) {
      return;
    }

    const textToSend = composerText.trim();
    const attachments = attachmentUrl.trim()
      ? [{ type: 'image' as const, url: attachmentUrl.trim() }]
      : [];

    try {
      setSendingMsg(true);
      setComposerText('');
      setAttachmentUrl('');
      setShowAttachmentInput(false);

      const res = await sendSocialMessageAction({
        conversationId: activeConversation.id,
        text: textToSend,
        attachments,
      });

      if (res.success) {
        if (res.conversations) setConversations(res.conversations);
        if (res.messages) setMessages(res.messages);

        if (
          activeConversation.channel === 'whatsapp' &&
          (forceOpenWaWeb || openWaWebOnSend) &&
          res.whatsappUrl
        ) {
          window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
        }

        if (res.message?.externalError) {
          toast.warning(`Saved to chat log (API note: ${res.message.externalError})`);
        }
      } else {
        setComposerText(textToSend);
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

  // Insert Job Status Update into Composer
  const handleInsertJobStatus = (job: any) => {
    const custName = job.customerName || activeConversation?.contactName || 'Customer';
    const statusLabel = (job.status || 'processing').toUpperCase().replace(/_/g, ' ');
    const priceText = job.totalPrice ? `฿${Number(job.totalPrice).toLocaleString()}` : '';
    const msg = `🧺 Laundry Order Update (#${job.id})\nCustomer: ${custName}\nStatus: ${statusLabel}${
      priceText ? `\nTotal Amount: ${priceText}` : ''
    }${job.dropoffLocation ? `\nDelivery Address: ${job.dropoffLocation}` : ''}\n\nThank you for choosing That Laundry Shop! 💚`;

    setComposerText(msg);
    toast.success(`Inserted Order #${job.id} summary into message box`);
  };

  // Simulate Inbound Reply (for testing localhost workflow)
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
      if (res.conversations) setConversations(res.conversations);
      if (res.messages) setMessages(res.messages);
      toast.success(`Received message from ${activeConversation.contactName}`);
    }
  };

  // Sync LINE OA Followers
  const handleSyncLineFollowers = async () => {
    try {
      setSyncingLine(true);
      const res = await syncLineOaFollowersAction(100);
      if (res.success) {
        toast.success(
          `Synced ${res.contacts.length} LINE OA contacts (${res.linkedCustomerCount} newly linked to CRM)`
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

  // Save Channel Config
  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      setSavingSettings(true);
      const res = await saveSocialChannelConfigAction(config);
      if (res.success) {
        toast.success('Omnichannel settings saved!');
        setIsSettingsOpen(false);
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
    <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 space-y-5 w-full">
      {/* ================================================================ */}
      {/* 1. OMNICHANNEL HERO BANNER & PRIMARY ACTIONS                      */}
      {/* ================================================================ */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-xl relative overflow-hidden space-y-4">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-radial from-emerald-500/20 via-transparent to-transparent pointer-events-none" />

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <MessageSquare size={22} className="text-emerald-300" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
                Omnichannel Customer Hub
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-white/10 text-emerald-200 border border-white/15">
                  รวมแชทลูกค้าทุกช่องทาง (WhatsApp • LINE OA • Social)
                </span>
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-emerald-100/80 max-w-3xl leading-relaxed">
              Communicate with customers across WhatsApp, LINE Official Account (@thatlaundryshop),
              Facebook Messenger, Instagram Direct, and Telegram in one unified workspace. Start new
              WhatsApp chats directly with any phone number or CRM customer.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => setIsNewWhatsAppOpen(true)}
              className="h-10 px-4 bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-500/25 gap-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Phone size={15} className="fill-slate-950" />
              <span>+ New WhatsApp Chat (เปิดแชท WhatsApp)</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setIsNewSocialOpen(true)}
              className="h-10 px-3.5 bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold text-xs rounded-xl gap-1.5 cursor-pointer transition-all"
            >
              <Plus size={15} />
              <span>+ New Social Chat</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncLineFollowers}
              disabled={syncingLine}
              className="h-10 px-3 bg-[#06C755]/20 hover:bg-[#06C755]/30 border-[#06C755]/40 text-emerald-200 font-bold text-xs rounded-xl gap-1.5 cursor-pointer"
              title="Sync followers from LINE Official Account"
            >
              <RefreshCw size={14} className={syncingLine ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Sync LINE OA</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsSettingsOpen(true)}
              className="h-10 px-3 bg-white/10 hover:bg-white/20 border-white/20 text-white font-bold text-xs rounded-xl gap-1.5 cursor-pointer"
              title="Configure WhatsApp, LINE OA & Social Webhooks"
            >
              <Settings size={14} />
              <span className="hidden md:inline">Channels</span>
            </Button>
          </div>
        </div>

        {/* Channel Filter Pills Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-white/10 backdrop-blur-md rounded-xl border border-white/15 w-fit max-w-full overflow-x-auto relative z-10 custom-scrollbar">
          {(
            [
              { key: 'all', label: 'All Channels (ทั้งหมด)', count: stats.byChannel.all, dot: 'bg-white' },
              {
                key: 'whatsapp',
                label: 'WhatsApp',
                count: stats.byChannel.whatsapp,
                dot: 'bg-[#25D366]',
              },
              {
                key: 'line',
                label: 'LINE OA',
                count: stats.byChannel.line,
                dot: 'bg-[#06C755]',
              },
              {
                key: 'facebook',
                label: 'Messenger',
                count: stats.byChannel.facebook,
                dot: 'bg-[#0084FF]',
              },
              {
                key: 'instagram',
                label: 'Instagram',
                count: stats.byChannel.instagram,
                dot: 'bg-pink-500',
              },
              {
                key: 'telegram',
                label: 'Telegram',
                count: stats.byChannel.telegram,
                dot: 'bg-[#229ED9]',
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setChannelFilter(tab.key as any)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                channelFilter === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${tab.dot}`} />
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  channelFilter === tab.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-white/20 text-white'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* 2. MAIN 3-COLUMN OMNICHANNEL WORKSPACE                            */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch min-h-[680px]">
        {/* -------------------------------------------------------------- */}
        {/* LEFT COLUMN (3 cols): CONVERSATION LIST                        */}
        {/* -------------------------------------------------------------- */}
        <div className="lg:col-span-4 xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden h-[680px]">
          {/* Search & Status Tabs */}
          <div className="p-3 border-b border-slate-100 space-y-2.5 bg-slate-50/50">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer, +66 phone, LINE..."
                className="pl-8 h-9 text-xs bg-white border-slate-200 rounded-xl"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-1">
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
                  className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    statusFilter === st.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-200/60'
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
                <p>Loading conversations...</p>
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
                const chMeta = SOCIAL_CHANNEL_META[conv.channel] || SOCIAL_CHANNEL_META.whatsapp;
                const chColors = getChannelColorClasses(conv.channel);

                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`p-3.5 cursor-pointer transition-all hover:bg-slate-50 relative ${
                      isSelected
                        ? 'bg-emerald-50/60 border-l-4 border-l-emerald-600'
                        : conv.unreadCount > 0
                        ? 'bg-sky-50/30'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar + Channel Badge */}
                      <div className="relative shrink-0">
                        {conv.contactAvatar ? (
                          <img
                            src={conv.contactAvatar}
                            alt={conv.contactName}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white font-black text-xs flex items-center justify-center">
                            {(conv.contactName || 'C').slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full text-[8px] font-black uppercase shadow-xs ${chColors.badge}`}
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

                      {/* Name, Preview & Meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p
                            className={`text-xs truncate ${
                              conv.unreadCount > 0
                                ? 'font-black text-slate-950'
                                : 'font-bold text-slate-800'
                            }`}
                          >
                            {conv.contactName}
                          </p>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(conv.lastMessageAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {conv.contactPhone && (
                          <p className="text-[10px] text-emerald-700 font-semibold truncate">
                            {conv.contactPhone}
                          </p>
                        )}

                        <p
                          className={`text-[11px] truncate mt-0.5 ${
                            conv.unreadCount > 0
                              ? 'font-bold text-slate-900'
                              : 'text-slate-500'
                          }`}
                        >
                          {conv.lastMessageDirection === 'outbound' && (
                            <span className="text-slate-400 mr-1">You:</span>
                          )}
                          {conv.lastMessageText}
                        </p>

                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${chColors.lightBg}`}
                          >
                            {chMeta.shortLabel}
                          </span>
                          {conv.customerId && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                              CRM Linked
                            </span>
                          )}
                          {conv.status === 'resolved' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
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
        {/* CENTER COLUMN (6 cols): ACTIVE CHAT CONSOLE                     */}
        {/* -------------------------------------------------------------- */}
        <div
          className={`${
            showRightPanel ? 'lg:col-span-5 xl:col-span-6' : 'lg:col-span-8 xl:col-span-9'
          } bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden h-[680px]`}
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
                  Choose any customer thread on the left or click below to message a customer via
                  WhatsApp, LINE OA, Messenger, Instagram, or Telegram.
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
              {/* Active Chat Header */}
              <div className="px-4 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">
                    {(activeConversation.contactName || 'C').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-slate-900 truncate">
                        {activeConversation.contactName}
                      </h3>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          getChannelColorClasses(activeConversation.channel).badge
                        }`}
                      >
                        {SOCIAL_CHANNEL_META[activeConversation.channel].label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                      {(activeConversation.contactPhone ||
                        activeConversation.channel === 'whatsapp') && (
                        <button
                          type="button"
                          onClick={() => {
                            const ph =
                              activeConversation.contactPhone ||
                              activeConversation.externalContactId;
                            navigator.clipboard.writeText(ph);
                            toast.success(`Copied ${ph}`);
                          }}
                          className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline cursor-pointer"
                          title="Click to copy phone number"
                        >
                          <Phone size={11} />
                          <span>
                            {activeConversation.contactPhone ||
                              `+${activeConversation.externalContactId}`}
                          </span>
                          <Copy size={10} />
                        </button>
                      )}
                      {activeConversation.customerMemberId && (
                        <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-bold">
                          Member #{activeConversation.customerMemberId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chat Header Action Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(activeConversation.channel === 'whatsapp' ||
                    activeConversation.contactPhone) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = buildWhatsAppUrl(
                          activeConversation.contactPhone || activeConversation.externalContactId,
                          composerText
                        );
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                      className="h-8 px-2.5 text-[11px] font-bold border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded-lg gap-1 cursor-pointer"
                      title="Open direct chat in WhatsApp Web / App"
                    >
                      <ExternalLink size={12} />
                      <span>Open WhatsApp</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSimulateInboundReply}
                    className="h-8 px-2.5 text-[11px] font-bold border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg gap-1 cursor-pointer"
                    title="Simulate an incoming customer reply in this chat"
                  >
                    <Zap size={12} className="text-amber-500" />
                    <span className="hidden sm:inline">Simulate Reply</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleToggleResolved}
                    className={`h-8 px-2.5 text-[11px] font-bold rounded-lg gap-1 cursor-pointer ${
                      activeConversation.status === 'resolved'
                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <CheckCircle2 size={12} />
                    <span>
                      {activeConversation.status === 'resolved' ? 'Resolved' : 'Mark Resolved'}
                    </span>
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteConversation(activeConversation.id)}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                    title="Delete conversation"
                  >
                    <Trash2 size={14} />
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowRightPanel(!showRightPanel)}
                    className="h-8 px-2 text-[11px] font-bold text-slate-500 hover:text-slate-800 rounded-lg hidden lg:flex"
                    title="Toggle Customer CRM & Orders Sidebar"
                  >
                    <ChevronRight
                      size={15}
                      className={`transition-transform ${showRightPanel ? '' : 'rotate-180'}`}
                    />
                  </Button>
                </div>
              </div>

              {/* Chat Messages Timeline */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60 custom-scrollbar">
                {activeMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                    <MessageCircle size={28} className="text-slate-300" />
                    <p className="text-xs font-semibold">
                      No messages yet in this conversation. Send a greeting or template below!
                    </p>
                  </div>
                ) : (
                  activeMessages.map((msg) => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[10px] font-bold text-slate-500">
                            {isOutbound ? msg.senderName || 'Staff' : activeConversation.contactName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div
                          className={`max-w-[82%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-2xs whitespace-pre-wrap ${
                            isOutbound
                              ? activeConversation.channel === 'whatsapp'
                                ? 'bg-[#dcf8c6] text-slate-900 border border-emerald-200 rounded-tr-xs'
                                : activeConversation.channel === 'line'
                                ? 'bg-[#06C755] text-white rounded-tr-xs'
                                : 'bg-indigo-600 text-white rounded-tr-xs'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs'
                          }`}
                        >
                          {msg.text}

                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {msg.attachments.map((att, idx) =>
                                att.type === 'image' && att.url ? (
                                  <a
                                    key={idx}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block overflow-hidden rounded-xl border border-black/10"
                                  >
                                    <img
                                      src={att.url}
                                      alt="Attachment"
                                      className="max-h-48 w-auto object-cover"
                                    />
                                  </a>
                                ) : null
                              )}
                            </div>
                          )}
                        </div>

                        {isOutbound && (
                          <div className="flex items-center gap-1 mt-0.5 px-1 text-[9px] text-slate-400">
                            <CheckCheck size={11} className="text-emerald-600" />
                            <span>
                              {msg.deliveryMethod === 'line_api'
                                ? 'Delivered via LINE OA API'
                                : msg.deliveryMethod === 'whatsapp_cloud_api'
                                ? 'Delivered via WhatsApp Cloud API'
                                : msg.deliveryMethod === 'whatsapp_web_bridge'
                                ? 'Logged • WhatsApp Ready'
                                : 'Sent'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Laundry Templates Bar */}
              {showTemplatesBar && (
                <div className="px-3 py-2 bg-slate-100/80 border-t border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Sparkles size={11} className="text-amber-500" /> Quick Laundry Templates
                    </span>
                    <div className="flex items-center gap-1">
                      {(['en', 'th', 'both'] as const).map((lng) => (
                        <button
                          key={lng}
                          type="button"
                          onClick={() => setTemplateLang(lng)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase cursor-pointer ${
                            templateLang === lng
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {lng === 'both' ? 'TH+EN' : lng.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {DEFAULT_QUICK_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl)}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-[11px] font-bold text-slate-700 shrink-0 transition-all cursor-pointer shadow-2xs"
                      >
                        {tpl.title} ({tpl.titleTh})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachment Input Strip */}
              {showAttachmentInput && (
                <div className="px-3 py-2 bg-sky-50/70 border-t border-sky-200 flex items-center gap-2">
                  <ImageIcon size={14} className="text-sky-600 shrink-0" />
                  <Input
                    value={attachmentUrl}
                    onChange={(e) => setAttachmentUrl(e.target.value)}
                    placeholder="Paste public HTTPS image URL (e.g. delivery photo or QR slip)..."
                    className="h-8 text-xs bg-white rounded-lg flex-1"
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

              {/* Message Composer Footer */}
              <div className="p-3 bg-white border-t border-slate-200 space-y-2">
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAttachmentInput(!showAttachmentInput)}
                    className="h-10 w-10 p-0 rounded-xl border-slate-200 text-slate-500 hover:text-slate-800 shrink-0 cursor-pointer"
                    title="Attach image URL"
                  >
                    <ImageIcon size={16} />
                  </Button>

                  <textarea
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(false);
                      }
                    }}
                    rows={2}
                    placeholder={`Message ${activeConversation.contactName} via ${
                      SOCIAL_CHANNEL_META[activeConversation.channel].shortLabel
                    }... (Press Enter to send)`}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                  />

                  {activeConversation.channel === 'whatsapp' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSendMessage(true)}
                      disabled={sendingMsg || (!composerText.trim() && !attachmentUrl.trim())}
                      className="h-10 px-3 bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 font-black text-xs rounded-xl gap-1.5 shrink-0 cursor-pointer shadow-sm"
                      title="Log message in platform AND launch WhatsApp with pre-filled message"
                    >
                      <ExternalLink size={14} />
                      <span className="hidden sm:inline">Send & WhatsApp</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSendMessage(false)}
                    disabled={sendingMsg || (!composerText.trim() && !attachmentUrl.trim())}
                    className="h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Send size={14} />
                    <span>Send</span>
                  </Button>
                </div>

                {activeConversation.channel === 'whatsapp' && (
                  <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={openWaWebOnSend}
                        onChange={(e) => setOpenWaWebOnSend(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>
                        Always open WhatsApp Web/App (`wa.me`) automatically when pressing Enter
                      </span>
                    </label>
                    <span className="font-mono text-emerald-700 font-semibold">
                      wa.me/{formatPhoneForWhatsApp(activeConversation.externalContactId)}
                    </span>
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
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden h-[680px]">
            <div className="p-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <UserCheck size={15} className="text-indigo-600" />
                <span>Customer 360° & Orders</span>
              </span>
              {activeConversation && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsLinkCustomerOpen(true)}
                  className="h-7 px-2 text-[10px] font-bold rounded-lg gap-1 cursor-pointer"
                >
                  <Link2 size={11} />
                  <span>{linkedCustomer ? 'Change Link' : 'Link CRM'}</span>
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
              {!activeConversation ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  Select a conversation to view customer profile and active laundry orders.
                </p>
              ) : (
                <>
                  {/* Customer Profile Card */}
                  {linkedCustomer ? (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                            Verified CRM Member
                          </span>
                          <h4 className="text-sm font-black text-slate-900">
                            {linkedCustomer.name}
                          </h4>
                          {linkedCustomer.nickName && (
                            <p className="text-[11px] text-slate-500 font-semibold">
                              Nickname: {linkedCustomer.nickName}
                            </p>
                          )}
                        </div>
                        {linkedCustomer.memberId && (
                          <Badge className="bg-indigo-600 text-white text-[10px] font-mono">
                            #{linkedCustomer.memberId}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-white rounded-lg p-2 border border-indigo-100/80">
                          <span className="text-[9px] font-bold uppercase text-slate-400 block">
                            Wallet Balance
                          </span>
                          <span className="text-xs font-black text-emerald-700">
                            ฿{Number(linkedCustomer.creditBalance ?? linkedCustomer.walletBalance ?? 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-white rounded-lg p-2 border border-indigo-100/80">
                          <span className="text-[9px] font-bold uppercase text-slate-400 block">
                            Phone
                          </span>
                          <span className="text-[11px] font-bold text-slate-800 truncate block">
                            {linkedCustomer.phone || '-'}
                          </span>
                        </div>
                      </div>

                      {onCreateJobForCustomer && (
                        <Button
                          size="sm"
                          onClick={() => onCreateJobForCustomer(linkedCustomer)}
                          className="w-full h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg gap-1.5 cursor-pointer"
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
                        className="h-8 px-3 text-xs font-bold rounded-lg gap-1.5 cursor-pointer"
                      >
                        <Link2 size={13} />
                        <span>Link to CRM Customer</span>
                      </Button>
                    </div>
                  )}

                  {/* Quick Channel Actions */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Direct Channel Launch
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(activeConversation.contactPhone ||
                        activeConversation.channel === 'whatsapp' ||
                        linkedCustomer?.phone) && (
                        <a
                          href={buildWhatsAppUrl(
                            activeConversation.contactPhone ||
                              linkedCustomer?.phone ||
                              activeConversation.externalContactId,
                            composerText
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-xs font-bold text-emerald-900 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <Phone size={13} className="text-emerald-600" />
                            <span>Chat on WhatsApp Web / App</span>
                          </span>
                          <ExternalLink size={12} />
                        </a>
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
                        {customerJobs.map((job) => (
                          <div
                            key={job.id}
                            className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-all space-y-1.5"
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
                                className="text-[9px] font-bold uppercase px-1.5 py-0"
                              >
                                {job.status}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-600">
                              <span className="truncate">{job.serviceType || 'Laundry'}</span>
                              <span className="font-black text-slate-900">
                                ฿{Number(job.totalPrice || 0).toLocaleString()}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleInsertJobStatus(job)}
                              className="w-full h-7 text-[10px] font-bold rounded-lg gap-1 border-slate-200 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 cursor-pointer"
                            >
                              <Send size={10} />
                              <span>Insert Order Update in Chat</span>
                            </Button>
                          </div>
                        ))}
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
                  Select an existing CRM customer or enter any phone number to start a WhatsApp
                  conversation immediately.
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
                      wa.me/{liveFormattedWaPhone}
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

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={creatingWaChat}
                onClick={() => handleCreateWhatsAppChat(false)}
                className="h-9 px-3 text-xs font-bold rounded-xl border-slate-300 cursor-pointer"
              >
                Create in Platform Only
              </Button>

              <Button
                type="button"
                disabled={creatingWaChat}
                onClick={() => handleCreateWhatsAppChat(true)}
                className="h-9 px-4 bg-[#25D366] hover:bg-[#1ebe5d] text-slate-950 font-black text-xs rounded-xl gap-1.5 cursor-pointer shadow-md"
              >
                <ExternalLink size={14} />
                <span>Start Chat & Open WhatsApp</span>
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
              Connect with a customer via LINE OA, Facebook Messenger, Instagram Direct, or Telegram.
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
      {/* MODAL 4: CHANNEL SETTINGS & WEBHOOK CONFIGURATION                */}
      {/* ================================================================ */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-xl rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              Omnichannel Social Integration Settings
            </DialogTitle>
          </DialogHeader>

          {config && (
            <div className="space-y-4 text-xs">
              {/* WhatsApp Config */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-emerald-900 text-sm">
                    1. WhatsApp Integration
                  </span>
                  <Badge className="bg-[#25D366] text-slate-950 font-black">Active</Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Dispatch Mode</label>
                    <select
                      value={config.whatsapp.mode}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          whatsapp: {
                            ...config.whatsapp,
                            mode: e.target.value as 'web_bridge' | 'cloud_api',
                          },
                        })
                      }
                      className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 font-bold"
                    >
                      <option value="web_bridge">
                        WhatsApp Web / App Direct Bridge (wa.me)
                      </option>
                      <option value="cloud_api">Meta WhatsApp Business Cloud API</option>
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
                      className="h-9 bg-white"
                    />
                  </div>
                </div>

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

                <p className="text-[11px] text-slate-500">
                  Webhook URL for Meta / Social Channels:{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded border font-mono">
                    /api/webhooks/social
                  </code>
                </p>
              </div>

              {/* LINE OA Config */}
              <div className="p-4 rounded-xl border border-green-200 bg-green-50/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-green-900 text-sm">
                    2. LINE Official Account
                  </span>
                  <Badge className="bg-[#06C755] text-white font-bold">
                    Connected ({config.line.basicId})
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600">
                  Outbound messages in LINE OA threads are pushed directly to the customer&apos;s
                  LINE app via the Messaging API. Incoming messages arrive via{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded border font-mono">
                    /api/webhooks/line
                  </code>
                  .
                </p>
              </div>

              {/* Messenger / Instagram / Telegram */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <span className="font-black text-slate-900 text-sm block">
                  3. Messenger, Instagram & Telegram Handles
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">Facebook Page</label>
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
                    <label className="text-[10px] font-bold text-slate-500">Instagram Handle</label>
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
                    <label className="text-[10px] font-bold text-slate-500">Telegram Bot</label>
                    <Input
                      value={config.telegram.botUsername}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          telegram: { ...config.telegram, botUsername: e.target.value },
                        })
                      }
                      className="h-8 text-xs bg-white"
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
              Save Channel Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
