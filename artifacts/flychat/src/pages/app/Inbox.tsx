import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import {
  Search, Phone, ShoppingBag, Send, User, MessageSquare, Globe,
  Paperclip, Loader2, X, Plus, Minus, Trash2, ChevronRight, ChevronLeft,
  Check, ClipboardList, CheckCircle2, Package,
} from "lucide-react";
import {
  useGetConversations, useGetMessages, useSendMessage,
  useGetCustomer, useGetProducts, useCreateOrder,
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
  if (isImage) {
    return (
      <div className="mb-2">
        <a href={src} target="_blank" rel="noopener noreferrer">
          <img src={src} alt={attachment.name} className="max-w-xs max-h-64 rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity" />
        </a>
      </div>
    );
  }
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

function DraftField({
  label, value, onChange, error, placeholder, as,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  as?: "textarea" | "select-wilaya";
}) {
  const base = `w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-primary/20 ${error ? "border-red-400" : "border-border"}`;
  if (as === "textarea") {
    return (
      <div>
        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</label>
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2}
          className={`${base} resize-none`} placeholder={placeholder} />
        {error && <p className="text-red-500 text-[10px] mt-0.5">{error}</p>}
      </div>
    );
  }
  if (as === "select-wilaya") {
    return (
      <div>
        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</label>
        <select value={value} onChange={e => onChange(e.target.value)}
          className={`${base} bg-white`}>
          <option value="">{placeholder || "—"}</option>
          {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        {error && <p className="text-red-500 text-[10px] mt-0.5">{error}</p>}
      </div>
    );
  }
  return (
    <div>
      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        className={base} placeholder={placeholder} />
      {error && <p className="text-red-500 text-[10px] mt-0.5">{error}</p>}
    </div>
  );
}

export default function Inbox() {
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [msgInput, setMsgInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
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

  const msgMenuRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const productDropRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: convsData, isLoading: isLoadingConvs } = useGetConversations({ status: "open" });
  const { data: msgsData } = useGetMessages(activeConvId || "", { query: { enabled: !!activeConvId } });
  const sendMutation = useSendMessage();
  const createOrderMutation = useCreateOrder();

  const activeConv = convsData?.conversations?.find(c => c.id === activeConvId) as ConversationWithWidget | undefined;

  const { data: customerData } = useGetCustomer(activeConv?.customerId || "", {
    query: { enabled: !!activeConv?.customerId },
  });

  const { data: productsData } = useGetProducts(
    { search: productSearch, limit: 8 },
    { query: { enabled: productSearch.length >= 1 } }
  );

  // Socket.IO
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
    socketRef.current = socket;
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [queryClient]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeConvId) return;
    socket.emit("join_conversation", activeConvId);
    return () => { socket.emit("leave_conversation", activeConvId); };
  }, [activeConvId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgsData?.messages]);

  // Reset state when switching conversations
  useEffect(() => {
    setRightPanel("customer");
    setOrderDraft(null);
    setMsgMenu(null);
    setUsedMsgIds([]);
    setOrderSuccess(false);
    setDraftErrors({});
    setProductSearch("");
  }, [activeConvId]);

  // Close message menu on outside click
  useEffect(() => {
    if (!msgMenu) return;
    const handler = (e: MouseEvent) => {
      if (msgMenuRef.current && !msgMenuRef.current.contains(e.target as Node)) {
        setMsgMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [msgMenu]);

  // Close product drop on outside click (use container ref so clicking inside dropdown is not "outside")
  useEffect(() => {
    if (!productDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (productDropRef.current && !productDropRef.current.contains(e.target as Node)) {
        setProductDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [productDropOpen]);

  const cancelDraft = useCallback(() => {
    setRightPanel("customer");
    setOrderDraft(null);
    setMsgMenu(null);
    setDraftTab("draft");
    setDraftErrors({});
    setProductSearch("");
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
    setRightPanel("draft");
    setDraftTab("draft");
    setOrderSuccess(false);
    setDraftErrors({});
    setProductSearch("");
  }, [activeConv, customerData]);

  const updateDraftField = useCallback((field: keyof Omit<OrderDraft, "items">, value: string) => {
    setOrderDraft(prev => prev ? { ...prev, [field]: value } : prev);
  }, []);

  const applyToField = useCallback((
    field: keyof Omit<OrderDraft, "items">,
    value: string,
    label: string,
    msgId: string,
  ) => {
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
      setOrderDraft(prev => prev ? {
        ...prev,
        [fieldConflict.field]: prev[fieldConflict.field] + " " + fieldConflict.newValue,
      } : prev);
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
      setOrderDraft(prev => prev ? {
        ...prev,
        items: [...prev.items, { productId: product.id, productName: product.name, quantity: 1, price: product.price }],
      } : prev);
    }
    setProductSearch("");
    setProductDropOpen(false);
  }, [orderDraft]);

  const addCustomItem = useCallback(() => {
    setOrderDraft(prev => prev ? {
      ...prev,
      items: [...prev.items, { productName: "", quantity: 1, price: 0 }],
    } : prev);
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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        queryClient.refetchQueries({ queryKey: ['/api/orders'] });
        setOrderSuccess(true);
        setTimeout(() => {
          setRightPanel("customer");
          setOrderDraft(null);
          setOrderSuccess(false);
        }, 2500);
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
    sendMutation.mutate({ id: activeConvId, data: { content, attachment } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(activeConvId) });
        queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
      },
    });
    setMsgInput("");
    setSelectedFile(null);
  };

  const fieldOptions: { field: keyof Omit<OrderDraft, "items">; label: string }[] = [
    { field: "customerName", label: t("order.use_as_name") },
    { field: "customerPhone", label: t("order.use_as_phone") },
    { field: "customerEmail", label: t("order.use_as_email") },
    { field: "address", label: t("order.use_as_address") },
    { field: "sellerNote", label: t("order.use_as_note") },
  ];

  return (
    <AppLayout>
      <div className="flex-1 flex h-full bg-background overflow-hidden">

        {/* Field conflict dialog */}
        {fieldConflict && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setFieldConflict(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 max-w-full" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold mb-1 text-foreground">{t("order.field_conflict")}</h3>
              <p className="text-xs text-muted-foreground mb-3">{t("order.field_conflict_desc")}</p>
              <div className="bg-secondary/50 rounded-xl p-3 text-xs text-foreground mb-4 italic break-words">
                "{fieldConflict.newValue}"
              </div>
              <div className="flex gap-2">
                <button onClick={() => resolveConflict("replace")}
                  className="flex-1 px-3 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors">
                  {t("order.replace")}
                </button>
                <button onClick={() => resolveConflict("append")}
                  className="flex-1 px-3 py-2 bg-secondary text-foreground rounded-xl text-xs font-bold hover:bg-secondary/80 transition-colors">
                  {t("order.append")}
                </button>
                <button onClick={() => setFieldConflict(null)}
                  className="px-3 py-2 border border-border rounded-xl text-xs hover:bg-secondary transition-colors">
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Message context menu */}
        {msgMenu && (
          <div ref={msgMenuRef}
            className="fixed z-40 bg-white border border-border rounded-2xl shadow-xl py-1 min-w-[190px]"
            style={{
              left: Math.min(msgMenu.x + 4, window.innerWidth - 210),
              top: Math.min(msgMenu.y - 8, window.innerHeight - 240),
            }}>
            <div className="px-3 py-2 border-b border-border/50">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("order.map_to_field")}</p>
              <p className="text-xs text-foreground truncate max-w-[168px] mt-0.5 italic opacity-70">
                "{msgMenu.content.slice(0, 40)}{msgMenu.content.length > 40 ? "…" : ""}"
              </p>
            </div>
            {fieldOptions.map(({ field, label }) => (
              <button key={field}
                onClick={() => orderDraft ? applyToField(field, msgMenu.content, label, msgMenu.msgId) : null}
                className="w-full text-left px-3 py-2.5 text-xs hover:bg-primary/5 flex items-center gap-2 transition-colors">
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── LEFT PANEL: Conversation list ── */}
        <div className={`w-64 flex-col border-r border-border bg-card z-10 shrink-0 ${activeConvId ? "hidden xl:flex" : "flex"}`}>
          <div className="p-4 border-b border-border/50">
            <h2 className="text-lg font-bold mb-4">{t("nav.inbox")}</h2>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder={t("common.search")}
                className="w-full pl-9 pr-4 py-2 bg-secondary border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/30 outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isLoadingConvs ? (
              <div className="p-4 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : convsData?.conversations?.map((conv) => (
              <button key={conv.id} onClick={() => setActiveConvId(conv.id)}
                className={`w-full text-left p-3 rounded-xl transition-all border ${activeConvId === conv.id ? "bg-primary/10 border-primary/20 shadow-sm" : "hover:bg-secondary/50 border-transparent"}`}>
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-sm text-foreground truncate">{conv.customerName}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{format(new Date(conv.updatedAt), "HH:mm")}</span>
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
            ))}
          </div>
        </div>

        {/* ── CENTER PANEL: Chat ── */}
        {activeConv ? (
          <div className="flex-1 flex flex-col h-full bg-white min-w-0">
            {/* Chat header */}
            <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setActiveConvId(null)}
                  className="xl:hidden p-1.5 -ml-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors shrink-0">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold shrink-0">
                  {activeConv.customerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground leading-tight truncate">{activeConv.customerName}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
                    <span>Online via {activeConv.channel}</span>
                    {activeConv.sourcePageUrl && (() => {
                      try {
                        const hostname = new URL(activeConv.sourcePageUrl).hostname;
                        return (
                          <span className="flex items-center gap-1 ml-1 text-blue-500" title={activeConv.sourcePageUrl}>
                            <Globe className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[150px]">{hostname}</span>
                          </span>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                </div>
              </div>
              {rightPanel === "draft" && (
                <button onClick={cancelDraft}
                  className="px-3 py-2 bg-red-50 text-red-600 font-bold text-sm rounded-xl hover:bg-red-100 flex items-center gap-1.5 transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" /> {t("order.close_draft")}
                </button>
              )}
            </div>

            {/* Draft mode hint bar */}
            {rightPanel === "draft" && (
              <div className="bg-primary/5 border-b border-primary/20 px-6 py-2 text-xs text-primary font-medium flex items-center gap-2 shrink-0">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                {t("order.hint_click_message")}
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#f8fafc]">
              {msgsData?.messages.map((msg) => {
                const isCustomer = msg.sender === "customer";
                const metadata = msg.metadata as any;
                const attachment: FileAttachment | null = metadata?.attachment ?? null;
                const isUsed = usedMsgIds.includes(msg.id);
                const isClickable = isCustomer && rightPanel === "draft";

                return (
                  <div key={msg.id} className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-5 py-3 shadow-sm transition-all select-none
                        ${isCustomer
                          ? `bg-white text-foreground rounded-tl-sm border
                             ${isClickable ? "cursor-pointer hover:border-primary/50 hover:shadow-md active:scale-[0.99]" : "border-border/50"}
                             ${isUsed ? "border-green-400 bg-green-50/60" : ""}`
                          : "bg-primary text-primary-foreground rounded-tr-sm"
                        }`}
                      onClick={isClickable ? (e) => {
                        const content = (msg.content && msg.content !== `📎 ${attachment?.name}`)
                          ? msg.content
                          : attachment?.name || msg.content || "";
                        setMsgMenu({ msgId: msg.id, content, x: e.clientX, y: e.clientY });
                      } : undefined}
                    >
                      {isUsed && (
                        <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 mb-1.5">
                          <Check className="w-3 h-3" /> {t("order.used")}
                        </span>
                      )}
                      {attachment && <FilePreview attachment={attachment} isAgent={!isCustomer} />}
                      {msg.content && msg.content !== `📎 ${attachment?.name}` && (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      )}
                      <span className={`text-[10px] mt-2 block ${isCustomer ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                        {format(new Date(msg.createdAt), "HH:mm")}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat input */}
            <div className="p-4 bg-white border-t border-border shrink-0">
              {selectedFile && (
                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs flex justify-between items-center">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Paperclip className="w-3 h-3" />
                    <span className="truncate max-w-[300px]">{selectedFile.name}</span>
                    <span className="text-blue-500">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="text-blue-400 hover:text-blue-600 ml-2 shrink-0"><X className="w-3 h-3" /></button>
                </div>
              )}
              <div className="flex items-end gap-3 bg-secondary/30 border border-border rounded-2xl p-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                <input ref={fileInputRef} type="file" onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" />
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                  className="w-10 h-10 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0">
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  className="flex-1 bg-transparent border-none outline-none resize-none p-2 text-sm max-h-32 min-h-10"
                  placeholder="Type a message or / for quick replies..." rows={1} />
                <button onClick={handleSend}
                  disabled={(!msgInput.trim() && !selectedFile) || sendMutation.isPending || isUploading}
                  className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0 mb-0.5 mr-0.5">
                  {isUploading || sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                </button>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-[#f8fafc]">
            <div className="w-20 h-20 bg-white border border-border rounded-full flex items-center justify-center mb-4 shadow-sm">
              <MessageSquare className="w-10 h-10 text-border" />
            </div>
            <p className="text-lg font-medium text-foreground">No conversation selected</p>
            <p className="text-sm">Choose a chat from the list to start replying.</p>
          </div>
        )}

        {/* ── RIGHT PANEL: CRM + Order Draft (always visible, tabbed in draft mode) ── */}
        {activeConv && (
          <div className="border-l border-border bg-card hidden lg:flex flex-col shrink-0 overflow-hidden w-64">

            {/* Tab switcher — only in draft mode */}
            {rightPanel === "draft" && (
              <div className="flex border-b border-border shrink-0">
                <button
                  onClick={() => setDraftTab("crm")}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${draftTab === "crm" ? "text-primary border-primary bg-primary/5" : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50"}`}>
                  <User className="w-3.5 h-3.5" /> CRM
                </button>
                <button
                  onClick={() => setDraftTab("draft")}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${draftTab === "draft" ? "text-primary border-primary bg-primary/5" : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50"}`}>
                  <ClipboardList className="w-3.5 h-3.5" /> {t("order.draft")}
                </button>
              </div>
            )}

            {/* CRM tab — shown when no draft, or when "crm" tab selected */}
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
                  {rightPanel === "customer" && (
                    <button onClick={initDraft}
                      className="w-full px-4 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 flex items-center justify-center gap-2 transition-colors shadow-sm">
                      <ShoppingBag className="w-4 h-4" /> {t("order.create")}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Draft tab — shown when in draft mode and "draft" tab selected */}
            {rightPanel === "draft" && orderDraft && draftTab === "draft" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Draft panel header */}
                <div className="px-4 py-3 border-b border-border/50 flex items-center gap-3 shrink-0">
                  <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <ClipboardList className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-foreground leading-tight">{t("order.draft")}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{activeConv.customerName}</p>
                  </div>
                  <button onClick={cancelDraft}
                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors group" title={t("order.close_draft")}>
                    <X className="w-3.5 h-3.5 text-muted-foreground group-hover:text-red-500 transition-colors" />
                  </button>
                </div>

                {/* Success state */}
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
                          <DraftField label={t("order.name")} value={orderDraft.customerName}
                            onChange={v => updateDraftField("customerName", v)}
                            error={draftErrors.customerName} placeholder="Ahmed Benali" />
                          <DraftField label={t("order.phone")} value={orderDraft.customerPhone}
                            onChange={v => updateDraftField("customerPhone", v)}
                            error={draftErrors.customerPhone} placeholder="0550 123 456" />
                          <DraftField label={t("order.email")} value={orderDraft.customerEmail}
                            onChange={v => updateDraftField("customerEmail", v)}
                            placeholder="email@..." />
                          <DraftField label={t("order.wilaya")} value={orderDraft.wilaya}
                            onChange={v => updateDraftField("wilaya", v)}
                            error={draftErrors.wilaya} as="select-wilaya" />
                          <DraftField label={t("order.address")} value={orderDraft.address}
                            onChange={v => updateDraftField("address", v)}
                            placeholder="Rue, commune..." />
                          <DraftField label={t("order.note")} value={orderDraft.sellerNote}
                            onChange={v => updateDraftField("sellerNote", v)}
                            placeholder="Internal note..." as="textarea" />
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
                                  <input value={item.productName}
                                    onChange={e => updateItem(idx, "productName", e.target.value)}
                                    className={`flex-1 px-2 py-1 text-xs rounded-lg border outline-none focus:ring-1 focus:ring-primary/20 min-w-0 ${draftErrors[`item_${idx}`] ? "border-red-400" : "border-border"}`}
                                    placeholder="Product name *" />
                                  <button onClick={() => removeItem(idx)}
                                    className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors shrink-0">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="flex gap-1.5">
                                  <div className="flex items-center border border-border rounded-lg overflow-hidden">
                                    <button onClick={() => updateItem(idx, "quantity", Math.max(1, item.quantity - 1))}
                                      className="px-1.5 py-1 text-muted-foreground hover:bg-secondary transition-colors">
                                      <Minus className="w-2.5 h-2.5" />
                                    </button>
                                    <span className="px-2 text-xs font-bold text-foreground">{item.quantity}</span>
                                    <button onClick={() => updateItem(idx, "quantity", item.quantity + 1)}
                                      className="px-1.5 py-1 text-muted-foreground hover:bg-secondary transition-colors">
                                      <Plus className="w-2.5 h-2.5" />
                                    </button>
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

                {/* Footer: total + confirm */}
                {!orderSuccess && (
                  <div className="p-4 border-t border-border shrink-0 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("order.total")}</span>
                      <span className="text-lg font-bold text-primary">DZD {draftTotal.toLocaleString()}</span>
                    </div>
                    <button onClick={handleCreateOrder} disabled={createOrderMutation.isPending}
                      className="w-full py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm">
                      {createOrderMutation.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                        : <><Check className="w-4 h-4" /> {t("order.confirm")}</>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
