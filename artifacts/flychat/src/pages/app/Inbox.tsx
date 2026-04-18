import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { DocButton } from "@/components/DocButton";
import {
  Search, Phone, ShoppingBag, Send, User, MessageSquare, Globe,
  Paperclip, Loader2, X, Plus, Minus, Trash2, ChevronRight, ChevronLeft,
  Check, ClipboardList, CheckCircle2, Package, Bell, Bot, UserCheck,
  Archive, ArchiveRestore,
} from "lucide-react";
import {
  useGetConversations, useGetMessages, useSendMessage,
  useGetCustomer, useGetProducts, useCreateOrder,
  useGetAiStatus, useUpdateConversationAiMode,
  Conversation, Product,
  getGetMessagesQueryKey, getGetConversationsQueryKey, getGetOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { io, Socket } from "socket.io-client";

const WILAYAS = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar",
  "Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger",
  "Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma",
  "Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh",
  "Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued",
  "Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent",
  "Ghardaïa","Relizane","Timimoun","Bordj Badji Mokhtar","Ouled Djellal","Béni Abbès",
  "In Salah","In Guezzam","Touggourt","Djanet","El M'Ghair","El Méniaa",
];

const LEAD_STAGE_BADGE: Record<string, { label: string; color: string }> = {
  interested:      { label: "Interested",    color: "bg-gray-100 text-gray-600"        },
  engaged:         { label: "Engaged",       color: "bg-blue-100 text-blue-700"        },
  qualified_lead:  { label: "🔥 Qualified",  color: "bg-green-100 text-green-700"      },
  order_confirmed: { label: "✅ Confirmed",  color: "bg-emerald-100 text-emerald-700"  },
};

const CHANNEL_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  whatsapp:  { label: "WhatsApp",  color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200", dot: "bg-green-500"  },
  instagram: { label: "Instagram", color: "text-pink-700",   bg: "bg-pink-50",    border: "border-pink-200",  dot: "bg-pink-500"   },
  messenger: { label: "Messenger", color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200",  dot: "bg-blue-500"   },
  widget:    { label: "Widget",    color: "text-violet-700", bg: "bg-violet-50",  border: "border-violet-200",dot: "bg-violet-500" },
};

function ChannelIcon({ channel, size = "sm" }: { channel: string; size?: "sm" | "md" }) {
  const s = size === "md" ? "w-4 h-4" : "w-3 h-3";
  if (channel === "whatsapp") return (
    <svg className={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
  if (channel === "instagram") return (
    <svg className={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
  if (channel === "messenger") return (
    <svg className={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.259L19.752 8l-6.561 6.963z"/>
    </svg>
  );
  return (
    <svg className={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const cfg = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.widget;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <ChannelIcon channel={channel} size="sm" />
      {cfg.label}
    </span>
  );
}

function ChannelHeaderBadge({ channel }: { channel: string }) {
  const cfg = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.widget;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      <ChannelIcon channel={channel} size="sm" />
      {cfg.label}
    </span>
  );
}

interface ConversationWithWidget extends Conversation {
  sourcePageUrl?: string | null;
}

interface FileAttachment {
  objectPath: string;
  name: string;
  size: number;
  contentType: string;
}

interface DraftLineItem {
  productId?: string;
  productName: string;
  variant?: string;
  quantity: number;
  price: number;
}

interface OrderDraft {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  wilaya: string;
  address: string;
  sellerNote: string;
  items: DraftLineItem[];
}

interface MsgMenu {
  msgId: string;
  content: string;
  x: number;
  y: number;
}

interface FieldConflict {
  field: keyof Omit<OrderDraft, "items">;
  label: string;
  newValue: string;
  msgId: string;
}

interface TeamNotificationToast {
  id: number;
  type: string;
  message: string;
  conversationId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  timestamp: string;
}

async function uploadFileToStorage(file: File): Promise<FileAttachment> {
  const urlRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!urlRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await urlRes.json();
  const uploadRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!uploadRes.ok) throw new Error("Failed to upload file");
  return { objectPath, name: file.name, size: file.size, contentType: file.type };
}

function FilePreview({ attachment, isAgent }: { attachment: FileAttachment; isAgent: boolean }) {
  const src = `/api/storage${attachment.objectPath}`;
  const isImage = attachment.contentType.startsWith("image/");
  if (isImage) return (
    <div className="mb-2">
      <a href={src} target="_blank" rel="noopener noreferrer">
        <img src={src} alt={attachment.name} className="max-w-xs max-h-64 rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity" />
      </a>
    </div>
  );
  return (
    <div className="mb-2">
      <a href={src} download={attachment.name} target="_blank" rel="noopener noreferrer"
        className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${isAgent ? "border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" : "border-border text-blue-600 hover:bg-blue-50"} transition-colors`}>
        <Paperclip className="w-3 h-3 shrink-0" />
        <span className="truncate max-w-[180px]">{attachment.name}</span>
        <span className="opacity-60 shrink-0">↓</span>
      </a>
    </div>
  );
}

function DraftField({ label, value, onChange, error, placeholder, as }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; as?: "textarea" | "select-wilaya";
}) {
  const base = `w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-primary/20 ${error ? "border-red-400" : "border-border"}`;
  if (as === "textarea") return (
    <div>
      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={2} className={`${base} resize-none`} placeholder={placeholder} />
      {error && <p className="text-red-500 text-[10px] mt-0.5">{error}</p>}
    </div>
  );
  if (as === "select-wilaya") return (
    <div>
      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={`${base} bg-white`}>
        <option value="">{placeholder || "—"}</option>
        {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
      </select>
      {error && <p className="text-red-500 text-[10px] mt-0.5">{error}</p>}
    </div>
  );
  return (
    <div>
      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} className={base} placeholder={placeholder} />
      {error && <p className="text-red-500 text-[10px] mt-0.5">{error}</p>}
    </div>
  );
}

export default function Inbox() {
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [msgInput, setMsgInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const [rightPanel, setRightPanel] = useState<"customer" | "draft">("customer");
  const [orderDraft, setOrderDraft] = useState<OrderDraft | null>(null);
  const [msgMenu, setMsgMenu] = useState<MsgMenu | null>(null);
  const [fieldConflict, setFieldConflict] = useState<FieldConflict | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productDropOpen, setProductDropOpen] = useState(false);
  const [usedMsgIds, setUsedMsgIds] = useState<string[]>([]);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [draftTab, setDraftTab] = useState<"crm" | "draft">("draft");
  const [lastCreatedOrder, setLastCreatedOrder] = useState<{ orderNumber: string; total: number; status: string; customerName: string } | null>(null);
  const [teamNotifications, setTeamNotifications] = useState<TeamNotificationToast[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedConvs, setArchivedConvs] = useState<any[]>([]);
  const [archiveToast, setArchiveToast] = useState<string | null>(null);

  const msgMenuRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const productDropRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: convsData, isLoading: isLoadingConvs } = useGetConversations({ status: "open" });
  const { data: msgsData } = useGetMessages(activeConvId || "", { query: { enabled: !!activeConvId, queryKey: ["messages", activeConvId] } });

  const sendMutation = useSendMessage();
  const createOrderMutation = useCreateOrder();

  const activeConv = convsData?.conversations?.find(c => c.id === activeConvId) as ConversationWithWidget | undefined;

  const { data: customerData } = useGetCustomer(activeConv?.customerId || "", {
    query: { enabled: !!activeConv?.customerId, queryKey: ["customer", activeConv?.customerId] },
  });

  const { data: productsData } = useGetProducts(
    { search: productSearch, limit: 8 },
    { query: { enabled: productSearch.length >= 1, queryKey: ["products", productSearch] } }
  );

  const allConvs = convsData?.conversations ?? [];
  const filteredConvs = channelFilter === "all"
    ? allConvs
    : allConvs.filter(c => c.channel === channelFilter);

  const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

  const fetchArchivedConvs = useCallback(async () => {
    const token = localStorage.getItem("flychat_token");
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/conversations?archived=true&limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setArchivedConvs(data.conversations ?? []);
    }
  }, [API_BASE]);

  useEffect(() => {
    if (showArchived) fetchArchivedConvs();
  }, [showArchived, fetchArchivedConvs]);

  const archiveConv = useCallback(async (id: string) => {
    const token = localStorage.getItem("flychat_token");
    if (!token) return;
    // Optimistic remove from list
    queryClient.setQueryData(getGetConversationsQueryKey({ status: "open" }), (old: any) => {
      if (!old) return old;
      return { ...old, conversations: old.conversations.filter((c: any) => c.id !== id) };
    });
    if (activeConvId === id) setActiveConvId(null);
    await fetch(`${API_BASE}/api/conversations/${id}/archive`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    setArchiveToast("Conversation archived");
    setTimeout(() => setArchiveToast(null), 3000);
  }, [API_BASE, activeConvId, queryClient]);

  const unarchiveConv = useCallback(async (id: string) => {
    const token = localStorage.getItem("flychat_token");
    if (!token) return;
    setArchivedConvs(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) setActiveConvId(null);
    await fetch(`${API_BASE}/api/conversations/${id}/unarchive`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
    queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
    setArchiveToast("Conversation restored");
    setTimeout(() => setArchiveToast(null), 3000);
  }, [API_BASE, activeConvId, queryClient]);

  useEffect(() => {
    const token = localStorage.getItem("flychat_token");
    if (!token) return;
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socket.on("new_message", (data: { conversationId: string; message: any }) => {
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
      queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(data.conversationId) });
    });
    socket.on("new_conversation_message", (data: { conversationId: string; storeId: string }) => {
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
      queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(data.conversationId) });
    });
    socket.on("team_notification", (data: Omit<TeamNotificationToast, "id">) => {
      const toastId = Date.now();
      setTeamNotifications(prev => [...prev, { ...data, id: toastId }]);
      setTimeout(() => setTeamNotifications(prev => prev.filter(n => n.id !== toastId)), 7000);
    });
    socketRef.current = socket;
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [queryClient]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeConvId) return;
    socket.emit("join_conversation", activeConvId);
    return () => { socket.emit("leave_conversation", activeConvId); };
  }, [activeConvId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgsData?.messages]);

  const prevUnreadConvId = useRef<string | null>(null);
  useEffect(() => {
    if (!activeConvId || !msgsData || prevUnreadConvId.current === activeConvId) return;
    prevUnreadConvId.current = activeConvId;
    queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
  }, [activeConvId, msgsData, queryClient]);

  useEffect(() => {
    setRightPanel("customer");
    setOrderDraft(null);
    setMsgMenu(null);
    setUsedMsgIds([]);
    setOrderSuccess(false);
    setDraftErrors({});
    setProductSearch("");
    setLastCreatedOrder(null);
  }, [activeConvId]);

  const { data: aiStatusData } = useGetAiStatus();
  const aiStatus = aiStatusData ?? null;
  const updateAiMode = useUpdateConversationAiMode();
  const togglingAiMode = updateAiMode.isPending;

  const toggleAiMode = useCallback(async (mode: "human" | "ai_autopilot") => {
    if (!activeConvId) return;
    try {
      await updateAiMode.mutateAsync({ id: activeConvId, data: { mode } });
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
    } catch (err) {
      console.error("[AI Mode] Toggle error:", err);
    }
  }, [activeConvId, queryClient, updateAiMode]);

  useEffect(() => {
    if (!msgMenu) return;
    const handler = (e: MouseEvent) => {
      if (msgMenuRef.current && !msgMenuRef.current.contains(e.target as Node)) setMsgMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [msgMenu]);

  useEffect(() => {
    if (!productDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (productDropRef.current && !productDropRef.current.contains(e.target as Node)) setProductDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [productDropOpen]);

  const cancelDraft = useCallback(() => {
    setRightPanel("customer"); setOrderDraft(null); setMsgMenu(null);
    setDraftTab("draft"); setDraftErrors({}); setProductSearch("");
  }, []);

  const initDraft = useCallback(() => {
    setOrderDraft({
      customerName: activeConv?.customerName || "",
      customerPhone: activeConv?.customerPhone || "",
      customerEmail: customerData?.email || "",
      wilaya: customerData?.wilaya || "",
      address: "",
      sellerNote: customerData?.notes || "",
      items: [],
    });
    setRightPanel("draft"); setDraftTab("draft"); setOrderSuccess(false);
    setDraftErrors({}); setProductSearch("");
  }, [activeConv, customerData]);

  const updateDraftField = useCallback((field: keyof Omit<OrderDraft, "items">, value: string) => {
    setOrderDraft(prev => prev ? { ...prev, [field]: value } : prev);
  }, []);

  const applyToField = useCallback((field: keyof Omit<OrderDraft, "items">, value: string, label: string, msgId: string) => {
    setMsgMenu(null);
    if (!orderDraft) return;
    const current = orderDraft[field];
    if (!current.trim()) {
      setOrderDraft(prev => prev ? { ...prev, [field]: value } : prev);
      setUsedMsgIds(prev => prev.includes(msgId) ? prev : [...prev, msgId]);
    } else {
      setFieldConflict({ field, label, newValue: value, msgId });
    }
  }, [orderDraft]);

  const resolveConflict = useCallback((action: "replace" | "append" | "cancel") => {
    if (!fieldConflict) return;
    if (action === "replace") {
      setOrderDraft(prev => prev ? { ...prev, [fieldConflict.field]: fieldConflict.newValue } : prev);
      setUsedMsgIds(prev => prev.includes(fieldConflict.msgId) ? prev : [...prev, fieldConflict.msgId]);
    } else if (action === "append") {
      setOrderDraft(prev => prev ? { ...prev, [fieldConflict.field]: prev[fieldConflict.field] + " " + fieldConflict.newValue } : prev);
      setUsedMsgIds(prev => prev.includes(fieldConflict.msgId) ? prev : [...prev, fieldConflict.msgId]);
    }
    setFieldConflict(null);
  }, [fieldConflict]);

  const addProduct = useCallback((product: Product) => {
    if (!orderDraft) return;
    const idx = orderDraft.items.findIndex(i => i.productId === product.id);
    if (idx >= 0) {
      setOrderDraft(prev => {
        if (!prev) return prev;
        const items = [...prev.items];
        items[idx] = { ...items[idx], quantity: items[idx].quantity + 1 };
        return { ...prev, items };
      });
    } else {
      setOrderDraft(prev => prev ? { ...prev, items: [...prev.items, { productId: product.id, productName: product.name, quantity: 1, price: product.price }] } : prev);
    }
    setProductSearch(""); setProductDropOpen(false);
  }, [orderDraft]);

  const addCustomItem = useCallback(() => {
    setOrderDraft(prev => prev ? { ...prev, items: [...prev.items, { productName: "", quantity: 1, price: 0 }] } : prev);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setOrderDraft(prev => prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev);
  }, []);

  const updateItem = useCallback((idx: number, field: keyof DraftLineItem, value: string | number) => {
    setOrderDraft(prev => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });
  }, []);

  const draftTotal = orderDraft?.items.reduce((sum, i) => sum + i.price * i.quantity, 0) || 0;

  const handleCreateOrder = useCallback(() => {
    if (!orderDraft || !activeConvId) return;
    const errs: Record<string, string> = {};
    if (!orderDraft.customerName.trim()) errs.customerName = t("order.required");
    if (!orderDraft.customerPhone.trim()) errs.customerPhone = t("order.required");
    if (!orderDraft.wilaya.trim()) errs.wilaya = t("order.required");
    if (orderDraft.items.length === 0) errs.items = t("order.items_required");
    orderDraft.items.forEach((item, idx) => {
      if (!item.productName.trim()) errs[`item_${idx}`] = t("order.required");
      if (item.price <= 0) errs[`item_${idx}_price`] = t("order.price_required");
    });
    setDraftErrors(errs);
    if (Object.keys(errs).length > 0) return;
    createOrderMutation.mutate({
      data: {
        customerName: orderDraft.customerName,
        customerPhone: orderDraft.customerPhone,
        customerEmail: orderDraft.customerEmail || undefined,
        wilaya: orderDraft.wilaya,
        address: orderDraft.address || undefined,
        sellerNote: orderDraft.sellerNote || undefined,
        conversationId: activeConvId,
        items: orderDraft.items.map(i => ({
          productId: i.productId,
          productName: i.productName,
          variant: i.variant,
          quantity: i.quantity,
          price: i.price,
        })),
      },
    }, {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
        setLastCreatedOrder({ orderNumber: data.orderNumber, total: data.total, status: data.status, customerName: data.customerName });
        setOrderSuccess(true);
        setTimeout(() => { setRightPanel("customer"); setOrderDraft(null); setOrderSuccess(false); }, 2500);
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? t("order.error_creating");
        alert(msg);
      },
    });
  }, [orderDraft, activeConvId, createOrderMutation, queryClient, t]);

  const handleSend = async () => {
    if ((!msgInput.trim() && !selectedFile) || !activeConvId) return;
    let attachment: FileAttachment | null = null;
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) { alert("File too large. Maximum size is 10MB."); return; }
      try {
        setIsUploading(true);
        attachment = await uploadFileToStorage(selectedFile);
      } catch { alert("Failed to upload file. Please try again."); setIsUploading(false); return; }
      setIsUploading(false);
    }
    const content = msgInput.trim() || (attachment ? `📎 ${attachment.name}` : "");
    sendMutation.mutate({ id: activeConvId, data: { content } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(activeConvId) });
        queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
      },
    });
    setMsgInput(""); setSelectedFile(null);
  };

  const fieldOptions: { field: keyof Omit<OrderDraft, "items">; label: string }[] = [
    { field: "customerName", label: t("order.use_as_name") },
    { field: "customerPhone", label: t("order.use_as_phone") },
    { field: "customerEmail", label: t("order.use_as_email") },
    { field: "address", label: t("order.use_as_address") },
    { field: "sellerNote", label: t("order.use_as_note") },
  ];

  const channelCounts = allConvs.reduce((acc, c) => {
    acc[c.channel] = (acc[c.channel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout>
      <div className="flex-1 flex h-full bg-background overflow-hidden">

        {/* Field conflict dialog */}
        {fieldConflict && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFieldConflict(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 max-w-full" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold mb-1 text-foreground">{t("order.field_conflict")}</h3>
              <p className="text-xs text-muted-foreground mb-3">{t("order.field_conflict_desc")}</p>
              <div className="bg-secondary/50 rounded-xl p-3 text-xs text-foreground mb-4 italic break-words">"{fieldConflict.newValue}"</div>
              <div className="flex gap-2">
                <button onClick={() => resolveConflict("replace")} className="flex-1 px-3 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors">{t("order.replace")}</button>
                <button onClick={() => resolveConflict("append")} className="flex-1 px-3 py-2 bg-secondary text-foreground rounded-xl text-xs font-bold hover:bg-secondary/80 transition-colors">{t("order.append")}</button>
                <button onClick={() => setFieldConflict(null)} className="px-3 py-2 border border-border rounded-xl text-xs hover:bg-secondary transition-colors">{t("common.cancel")}</button>
              </div>
            </div>
          </div>
        )}

        {/* Archive toast */}
        {archiveToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-2">
            <Archive className="w-4 h-4 shrink-0" />
            {archiveToast}
          </div>
        )}

        {/* Message context menu */}
        {msgMenu && (
          <div ref={msgMenuRef} className="fixed z-40 bg-white border border-border rounded-2xl shadow-xl py-1 min-w-[190px]"
            style={{ left: Math.min(msgMenu.x + 4, window.innerWidth - 210), top: Math.min(msgMenu.y - 8, window.innerHeight - 240) }}>
            <div className="px-3 py-2 border-b border-border/50">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("order.map_to_field")}</p>
              <p className="text-xs text-foreground truncate max-w-[168px] mt-0.5 italic opacity-70">"{msgMenu.content.slice(0, 40)}{msgMenu.content.length > 40 ? "…" : ""}"</p>
            </div>
            {fieldOptions.map(({ field, label }) => (
              <button key={field} onClick={() => orderDraft ? applyToField(field, msgMenu.content, label, msgMenu.msgId) : null}
                className="w-full text-left px-3 py-2.5 text-xs hover:bg-primary/5 flex items-center gap-2 transition-colors">
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />{label}
              </button>
            ))}
          </div>
        )}

        {/* ── LEFT PANEL ── */}
        <div className={`w-64 flex-col border-r border-border bg-card z-10 shrink-0 ${activeConvId ? "hidden xl:flex" : "flex"}`}>
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">{t("nav.inbox")}</h2>
              <DocButton docId="inbox" variant="ghost" label="" />
            </div>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder={t("common.search")}
                className="w-full pl-9 pr-4 py-2 bg-secondary border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/30 outline-none" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {[
                { key: "all", label: "All" },
                { key: "whatsapp", label: "WA" },
                { key: "instagram", label: "IG" },
                { key: "messenger", label: "MSG" },
                { key: "widget", label: "Web" },
              ].map(({ key, label }) => {
                const count = key === "all" ? allConvs.length : (channelCounts[key] || 0);
                const cfg = CHANNEL_CONFIG[key];
                const isActive = !showArchived && channelFilter === key;
                return (
                  <button key={key} onClick={() => { setShowArchived(false); setChannelFilter(key); }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                      isActive
                        ? cfg ? `${cfg.bg} ${cfg.color} ${cfg.border}` : "bg-primary/10 text-primary border-primary/20"
                        : "bg-transparent text-muted-foreground border-transparent hover:bg-secondary"
                    }`}>
                    {key !== "all" && <ChannelIcon channel={key} size="sm" />}
                    {label}
                    {count > 0 && <span className={`px-1 rounded-full ${isActive ? "bg-white/60" : "bg-secondary"}`}>{count}</span>}
                  </button>
                );
              })}
              <button onClick={() => setShowArchived(v => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                  showArchived ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-transparent text-muted-foreground border-transparent hover:bg-secondary"
                }`}>
                <Archive className="w-3 h-3" />
                Archived
                {archivedConvs.length > 0 && <span className={`px-1 rounded-full ${showArchived ? "bg-amber-200/60" : "bg-secondary"}`}>{archivedConvs.length}</span>}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {showArchived ? (
              archivedConvs.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No archived conversations</div>
              ) : archivedConvs.map((conv) => (
                <div key={conv.id} className={`group w-full text-left p-3 rounded-xl transition-all border ${activeConvId === conv.id ? "bg-primary/10 border-primary/20 shadow-sm" : "hover:bg-secondary/50 border-transparent"}`}>
                  <button className="w-full text-left" onClick={() => setActiveConvId(conv.id)}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-sm text-foreground truncate flex-1">{conv.customerName}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{format(new Date(conv.updatedAt), "HH:mm")}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <ChannelBadge channel={conv.channel} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{conv.lastMessage || "No messages"}</p>
                  </button>
                  <button onClick={e => { e.stopPropagation(); unarchiveConv(conv.id); }}
                    title="Unarchive"
                    className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-800 font-bold transition-colors">
                    <ArchiveRestore className="w-3 h-3" /> Restore
                  </button>
                </div>
              ))
            ) : isLoadingConvs ? (
              <div className="p-4 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : filteredConvs.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No conversations</div>
            ) : filteredConvs.map((conv) => (
              <div key={conv.id} className={`group relative w-full text-left p-3 rounded-xl transition-all border ${activeConvId === conv.id ? "bg-primary/10 border-primary/20 shadow-sm" : "hover:bg-secondary/50 border-transparent"}`}>
                <button className="w-full text-left" onClick={() => setActiveConvId(conv.id)}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-sm text-foreground truncate flex-1 pr-6">{conv.customerName}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{format(new Date(conv.updatedAt), "HH:mm")}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <ChannelBadge channel={conv.channel} />
                    {conv.aiMode === "ai_autopilot" && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                        <Bot className="w-2.5 h-2.5" /> AI
                      </span>
                    )}
                    {(conv as any).leadStage && LEAD_STAGE_BADGE[(conv as any).leadStage] && (
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold ${LEAD_STAGE_BADGE[(conv as any).leadStage].color}`}>
                        {LEAD_STAGE_BADGE[(conv as any).leadStage].label}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground truncate flex-1 pr-2">{conv.lastMessage || "No messages"}</p>
                    {conv.unreadCount > 0 && (
                      <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
                <button onClick={e => { e.stopPropagation(); archiveConv(conv.id); }}
                  title="Archive"
                  className="absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all text-muted-foreground hover:text-foreground">
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── CENTER PANEL ── */}
        {activeConv ? (
          <div className="flex-1 flex flex-col h-full bg-white min-w-0">

            {/* ── Chat Header — 2 rows on mobile, 1 row on desktop ── */}
            <div className="border-b border-border bg-white shrink-0">

              {/* Row 1 — back + avatar + name + desktop actions */}
              <div className="flex items-center gap-2 px-3 lg:px-6 pt-3 pb-2 lg:py-0 lg:h-16">
                <button onClick={() => setActiveConvId(null)}
                  className="xl:hidden p-1.5 -ml-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors shrink-0">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 lg:w-10 lg:h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold shrink-0 text-sm">
                  {activeConv.customerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-foreground leading-tight truncate text-sm lg:text-base">{activeConv.customerName}</h3>
                  {/* Channel badge row — desktop only (shown in row 2 on mobile) */}
                  <div className="hidden lg:flex items-center gap-2 mt-0.5">
                    <ChannelHeaderBadge channel={activeConv.channel} />
                    {activeConv.sourcePageUrl && (() => {
                      try {
                        const hostname = new URL(activeConv.sourcePageUrl).hostname;
                        return (
                          <span className="flex items-center gap-1 text-xs text-blue-500" title={activeConv.sourcePageUrl}>
                            <Globe className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[120px]">{hostname}</span>
                          </span>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                </div>

                {/* Desktop action buttons — hidden on mobile */}
                <div className="hidden lg:flex items-center gap-2 shrink-0">
                  {activeConv.aiMode === "ai_autopilot" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-100 text-violet-700 text-xs font-bold rounded-full border border-violet-200">
                      <Bot className="w-3 h-3" /> {t("ai.active")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full border border-gray-200">
                      <UserCheck className="w-3 h-3" /> {t("ai.human")}
                    </span>
                  )}
                  {activeConv.aiMode === "human" ? (() => {
                    const aiUnavailable = aiStatus?.statusLabel === "not_included";
                    const aiStoreDisabled = aiStatus?.statusLabel === "disabled";
                    const disabled = togglingAiMode || aiUnavailable || aiStoreDisabled;
                    return (
                      <button onClick={() => !disabled && toggleAiMode("ai_autopilot")} disabled={disabled}
                        className={`px-3 py-1.5 font-bold text-xs rounded-xl flex items-center gap-1 transition-colors disabled:opacity-50 ${aiUnavailable || aiStoreDisabled ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-violet-50 text-violet-700 hover:bg-violet-100"}`}>
                        <Bot className="w-3 h-3" /> {t("ai.enable")}
                      </button>
                    );
                  })() : (
                    <button onClick={() => toggleAiMode("human")} disabled={togglingAiMode}
                      className="px-3 py-1.5 bg-amber-50 text-amber-700 font-bold text-xs rounded-xl hover:bg-amber-100 flex items-center gap-1 transition-colors disabled:opacity-50">
                      <UserCheck className="w-3 h-3" /> {t("ai.take_over")}
                    </button>
                  )}
                  {rightPanel === "draft" && (
                    <button onClick={cancelDraft}
                      className="px-3 py-2 bg-red-50 text-red-600 font-bold text-sm rounded-xl hover:bg-red-100 flex items-center gap-1.5 transition-colors">
                      <X className="w-3.5 h-3.5" /> {t("order.close_draft")}
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2 — mobile only: channel badge + AI controls */}
              <div className="lg:hidden flex items-center justify-between gap-2 px-3 pb-2.5">
                <ChannelHeaderBadge channel={activeConv.channel} />
                <div className="flex items-center gap-1.5 shrink-0">
                  {activeConv.aiMode === "ai_autopilot" ? (
                    <>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-100 text-violet-700 text-[10px] font-bold rounded-full border border-violet-200">
                        <Bot className="w-3 h-3" /> {t("ai.active")}
                      </span>
                      <button onClick={() => toggleAiMode("human")} disabled={togglingAiMode}
                        className="px-2.5 py-1 bg-amber-50 text-amber-700 font-bold text-[10px] rounded-lg hover:bg-amber-100 flex items-center gap-1 transition-colors disabled:opacity-50">
                        <UserCheck className="w-3 h-3" /> {t("ai.take_over")}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full border border-gray-200">
                        <UserCheck className="w-3 h-3" /> {t("ai.human")}
                      </span>
                      {(() => {
                        const aiUnavailable = aiStatus?.statusLabel === "not_included";
                        const aiStoreDisabled = aiStatus?.statusLabel === "disabled";
                        const disabled = togglingAiMode || aiUnavailable || aiStoreDisabled;
                        return (
                          <button onClick={() => !disabled && toggleAiMode("ai_autopilot")} disabled={disabled}
                            className={`px-2.5 py-1 font-bold text-[10px] rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50 ${disabled ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-violet-50 text-violet-700 hover:bg-violet-100"}`}>
                            <Bot className="w-3 h-3" /> {t("ai.enable")}
                          </button>
                        );
                      })()}
                    </>
                  )}
                  {rightPanel === "draft" && (
                    <button onClick={cancelDraft}
                      className="px-2.5 py-1 bg-red-50 text-red-600 font-bold text-[10px] rounded-lg hover:bg-red-100 flex items-center gap-1 transition-colors">
                      <X className="w-3 h-3" /> {t("order.close_draft")}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {/* ── End Chat Header ── */}

            {/* Draft hint */}
            {rightPanel === "draft" && (
              <div className="bg-primary/5 border-b border-primary/20 px-6 py-2 text-xs text-primary font-medium flex items-center gap-2 shrink-0">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />{t("order.hint_click_message")}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 bg-[#f8fafc]">
              {msgsData?.messages.map((msg) => {
                const isCustomer = msg.sender === "customer";
                const metadata = (msg.metadata ?? {}) as Record<string, unknown>;
                const attachment: FileAttachment | null = (metadata?.attachment as FileAttachment) ?? null;
                const isUsed = usedMsgIds.includes(msg.id);
                const isClickable = isCustomer && rightPanel === "draft";
                const isAiGenerated = metadata?.aiGenerated === true;

                return (
                  <div key={msg.id} className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[80%] lg:max-w-[70%] rounded-2xl px-4 lg:px-5 py-3 shadow-sm transition-all select-text
                        ${isCustomer
                          ? `bg-white text-foreground rounded-tl-sm border
                             ${isClickable ? "cursor-pointer hover:border-primary/50 hover:shadow-md active:scale-[0.99]" : "border-border/50"}
                             ${isUsed ? "border-green-400 bg-green-50/60" : ""}`
                          : isAiGenerated
                            ? "bg-violet-600 text-white rounded-tr-sm"
                            : "bg-primary text-primary-foreground rounded-tr-sm"
                        }`}
                      onClick={isClickable ? (e) => {
                        const content = (msg.content && msg.content !== `📎 ${attachment?.name}`)
                          ? msg.content
                          : attachment?.name || msg.content || "";
                        setMsgMenu({ msgId: msg.id, content, x: e.clientX, y: e.clientY });
                      } : undefined}
                    >
                      {isAiGenerated && (
                        <span className="text-[10px] text-violet-200 font-bold flex items-center gap-1 mb-1.5">
                          <Bot className="w-3 h-3" /> {t("ai.generated")}
                        </span>
                      )}
                      {isUsed && (
                        <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 mb-1.5">
                          <Check className="w-3 h-3" /> {t("order.used")}
                        </span>
                      )}
                      {metadata?.type === "image" && metadata?.imageUrl ? (
                        <div>
                          <img
                            src={metadata.imageUrl as string}
                            alt={(metadata.description as string) || ""}
                            className="rounded-xl max-w-[220px] max-h-[220px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(metadata.imageUrl as string, "_blank")}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                          {metadata.description && (
                            <p className="text-xs mt-1 opacity-80">{metadata.description as string}</p>
                          )}
                        </div>
                      ) : (
                        <>
                          {attachment && <FilePreview attachment={attachment} isAgent={!isCustomer} />}
                          {msg.content && msg.content !== `📎 ${attachment?.name}` && (
                            <p className="text-sm leading-relaxed">{msg.content}</p>
                          )}
                        </>
                      )}
                      <span className={`text-[10px] mt-2 block ${isCustomer ? "text-muted-foreground" : isAiGenerated ? "text-violet-200/70" : "text-primary-foreground/70"}`}>
                        {format(new Date(msg.createdAt), "HH:mm")}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat input */}
            <div className="p-3 lg:p-4 bg-white border-t border-border shrink-0">
              {activeConv.aiMode === "ai_autopilot" && (
                <div className="mb-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-700 font-medium flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5 shrink-0" />
                  AI is handling this conversation. Click <strong>Take Over</strong> to reply manually.
                </div>
              )}
              {selectedFile && (
                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs flex justify-between items-center">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Paperclip className="w-3 h-3" />
                    <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                    <span className="text-blue-500">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="text-blue-400 hover:text-blue-600 ml-2 shrink-0"><X className="w-3 h-3" /></button>
                </div>
              )}
              <div className="flex items-end gap-2 bg-secondary/30 border border-border rounded-2xl p-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                <input ref={fileInputRef} type="file" onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" />
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                  className="w-9 h-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0">
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  className="flex-1 bg-transparent border-none outline-none resize-none p-1.5 text-sm max-h-32 min-h-9"
                  placeholder={activeConv.aiMode === "ai_autopilot" ? "AI is active — take over to type..." : "Type a message..."}
                  rows={1} />
                <button onClick={handleSend}
                  disabled={(!msgInput.trim() && !selectedFile) || sendMutation.isPending || isUploading}
                  className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
                  {isUploading || sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden xl:flex flex-col items-center justify-center text-muted-foreground bg-[#f8fafc]">
            <div className="w-20 h-20 bg-white border border-border rounded-full flex items-center justify-center mb-4 shadow-sm">
              <MessageSquare className="w-10 h-10 text-border" />
            </div>
            <p className="text-lg font-medium text-foreground">{t("inbox.no_conv_selected")}</p>
            <p className="text-sm">{t("inbox.no_conv_hint")}</p>
          </div>
        )}

        {/* ── RIGHT PANEL ── */}
        {activeConv && (
          <div className="border-l border-border bg-card hidden lg:flex flex-col shrink-0 overflow-hidden w-64">
            {rightPanel === "draft" && (
              <div className="flex border-b border-border shrink-0">
                <button onClick={() => setDraftTab("crm")}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${draftTab === "crm" ? "text-primary border-primary bg-primary/5" : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50"}`}>
                  <User className="w-3.5 h-3.5" /> CRM
                </button>
                <button onClick={() => setDraftTab("draft")}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${draftTab === "draft" ? "text-primary border-primary bg-primary/5" : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50"}`}>
                  <ClipboardList className="w-3.5 h-3.5" /> {t("order.draft")}
                </button>
              </div>
            )}

            {(rightPanel === "customer" || draftTab === "crm") && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                <div className="p-5 border-b border-border/50 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 mx-auto rounded-full flex items-center justify-center mb-3">
                    <User className="w-7 h-7 text-gray-400" />
                  </div>
                  <h3 className="font-bold text-base">{activeConv.customerName}</h3>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
                    <Phone className="w-3 h-3" /> {activeConv.customerPhone || "No phone"}
                  </p>
                  <div className="mt-2 flex justify-center">
                    <ChannelBadge channel={activeConv.channel} />
                  </div>
                </div>
                <div className="p-4 space-y-5 flex-1">
                  <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">CRM Context</h4>
                    <div className="bg-secondary/50 rounded-xl p-3 space-y-2.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Orders</span>
                        <span className="font-bold">{customerData?.totalOrders ?? 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <span className={`font-medium px-2 py-0.5 rounded text-xs ${customerData?.isRepeat ? "text-green-700 bg-green-50" : "text-blue-600 bg-blue-50"}`}>
                          {customerData?.isRepeat ? "Repeat" : "New Lead"}
                        </span>
                      </div>
                      {customerData?.wilaya && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Wilaya</span>
                          <span className="font-medium text-xs">{customerData.wilaya}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {lastCreatedOrder && (
                    <div>
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Latest Order</h4>
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          <span className="text-xs font-bold text-green-800">#{lastCreatedOrder.orderNumber}</span>
                          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 uppercase">{lastCreatedOrder.status}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-bold text-green-700">{lastCreatedOrder.total.toLocaleString()} DZD</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {rightPanel === "customer" && (
                    <button onClick={initDraft}
                      className="w-full px-4 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 flex items-center justify-center gap-2 transition-colors shadow-sm">
                      <ShoppingBag className="w-4 h-4" /> {t("order.create")}
                    </button>
                  )}
                </div>
              </div>
            )}

            {rightPanel === "draft" && orderDraft && draftTab === "draft" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-border/50 flex items-center gap-3 shrink-0">
                  <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <ClipboardList className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-foreground leading-tight">{t("order.draft")}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{activeConv.customerName}</p>
                  </div>
                  <button onClick={cancelDraft} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors group">
                    <X className="w-3.5 h-3.5 text-muted-foreground group-hover:text-red-500 transition-colors" />
                  </button>
                </div>

                {orderSuccess ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="font-bold text-foreground">{t("order.success")}</p>
                    <p className="text-xs text-muted-foreground">{t("order.success_desc")}</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-4 space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{t("order.customer_info")}</p>
                        <div className="space-y-2">
                          <DraftField label={t("order.name")} value={orderDraft.customerName} onChange={v => updateDraftField("customerName", v)} error={draftErrors.customerName} placeholder="Ahmed Benali" />
                          <DraftField label={t("order.phone")} value={orderDraft.customerPhone} onChange={v => updateDraftField("customerPhone", v)} error={draftErrors.customerPhone} placeholder="0550 123 456" />
                          <DraftField label={t("order.email")} value={orderDraft.customerEmail} onChange={v => updateDraftField("customerEmail", v)} placeholder="email@..." />
                          <DraftField label={t("order.wilaya")} value={orderDraft.wilaya} onChange={v => updateDraftField("wilaya", v)} error={draftErrors.wilaya} as="select-wilaya" />
                          <DraftField label={t("order.address")} value={orderDraft.address} onChange={v => updateDraftField("address", v)} placeholder="Rue, commune..." />
                          <DraftField label={t("order.note")} value={orderDraft.sellerNote} onChange={v => updateDraftField("sellerNote", v)} placeholder="Internal note..." as="textarea" />
                        </div>
                      </div>
                      <div className="border-t border-border/50" />
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{t("order.products")}</p>
                        {draftErrors.items && <p className="text-red-500 text-[10px] mb-2">{draftErrors.items}</p>}
                        <div ref={productDropRef} className="relative mb-2">
                          <input ref={productInputRef} value={productSearch}
                            onChange={e => { setProductSearch(e.target.value); setProductDropOpen(true); }}
                            onFocus={() => productSearch.length >= 1 && setProductDropOpen(true)}
                            placeholder={t("order.search_product")}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-border text-xs outline-none focus:ring-2 focus:ring-primary/20 pr-7" />
                          <Search className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          {productSearch && productDropOpen && (
                            <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                              {!productsData?.products?.length ? (
                                <div className="px-3 py-3 text-xs text-muted-foreground text-center">No products found</div>
                              ) : productsData.products.map(p => (
                                <button key={p.id} onClick={() => addProduct(p)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-primary/5 flex items-center gap-2 transition-colors">
                                  <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="flex-1 truncate">{p.name}</span>
                                  <span className="text-primary font-bold shrink-0">DZD {p.price.toLocaleString()}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button onClick={addCustomItem}
                          className="w-full text-xs text-primary font-semibold py-1.5 rounded-lg border border-dashed border-primary/30 hover:bg-primary/5 flex items-center justify-center gap-1 transition-colors mb-3">
                          <Plus className="w-3 h-3" /> {t("order.add_custom_item")}
                        </button>
                        {orderDraft.items.length > 0 && (
                          <div className="space-y-2">
                            {orderDraft.items.map((item, idx) => (
                              <div key={idx} className="bg-secondary/30 rounded-xl p-2.5 space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <input value={item.productName} onChange={e => updateItem(idx, "productName", e.target.value)}
                                    className={`flex-1 px-2 py-1 text-xs rounded-lg border outline-none focus:ring-1 focus:ring-primary/20 min-w-0 ${draftErrors[`item_${idx}`] ? "border-red-400" : "border-border"}`}
                                    placeholder="Product name *" />
                                  <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors shrink-0">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="flex gap-1.5">
                                  <div className="flex items-center border border-border rounded-lg overflow-hidden">
                                    <button onClick={() => updateItem(idx, "quantity", Math.max(1, item.quantity - 1))} className="px-1.5 py-1 text-muted-foreground hover:bg-secondary transition-colors"><Minus className="w-2.5 h-2.5" /></button>
                                    <span className="px-2 text-xs font-bold text-foreground">{item.quantity}</span>
                                    <button onClick={() => updateItem(idx, "quantity", item.quantity + 1)} className="px-1.5 py-1 text-muted-foreground hover:bg-secondary transition-colors"><Plus className="w-2.5 h-2.5" /></button>
                                  </div>
                                  <div className="flex-1">
                                    <input type="number" min={0} value={item.price || ""}
                                      onChange={e => updateItem(idx, "price", Number(e.target.value))}
                                      className={`w-full px-2 py-1 text-xs rounded-lg border outline-none focus:ring-1 focus:ring-primary/20 ${draftErrors[`item_${idx}_price`] ? "border-red-400" : "border-border"}`}
                                      placeholder="Price DZD" />
                                  </div>
                                </div>
                                <div className="text-right text-[10px] text-muted-foreground">
                                  = <span className="font-bold text-foreground">DZD {(item.price * item.quantity).toLocaleString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {!orderSuccess && (
                  <div className="p-4 border-t border-border shrink-0 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("order.total")}</span>
                      <span className="text-lg font-bold text-primary">DZD {draftTotal.toLocaleString()}</span>
                    </div>
                    <button onClick={handleCreateOrder} disabled={createOrderMutation.isPending}
                      className="w-full py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm">
                      {createOrderMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("common.loading")}</> : <><Check className="w-4 h-4" /> {t("order.confirm")}</>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Team notification toasts */}
      {teamNotifications.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {teamNotifications.map((notif) => (
            <div key={notif.id} className="bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-800 rounded-2xl shadow-2xl p-4 flex items-start gap-3 pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-300">
              <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wide mb-0.5">
                  {notif.type === "order_created" ? t("inbox.toast_new_order") : t("inbox.toast_automation")}
                </p>
                <p className="text-sm font-medium text-foreground leading-snug">{notif.message}</p>
                {notif.orderNumber && <p className="text-xs text-muted-foreground mt-0.5">Order #{notif.orderNumber}</p>}
              </div>
              <button onClick={() => setTeamNotifications(prev => prev.filter(n => n.id !== notif.id))} className="p-1 hover:bg-secondary rounded-lg shrink-0">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}