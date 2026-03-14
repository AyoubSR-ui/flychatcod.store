import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Search, Phone, ShoppingBag, Send, User, MessageSquare, Globe, Paperclip, Loader2, X } from "lucide-react";
import { useGetConversations, useGetMessages, useSendMessage, Conversation, getGetMessagesQueryKey, getGetConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { io, Socket } from "socket.io-client";

interface ConversationWithWidget extends Conversation {
  sourcePageUrl?: string | null;
}

interface FileAttachment {
  objectPath: string;
  name: string;
  size: number;
  contentType: string;
}

async function uploadFileToStorage(file: File): Promise<FileAttachment> {
  const urlRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!urlRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await urlRes.json();

  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
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
      <a
        href={src}
        download={attachment.name}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${isAgent ? "border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" : "border-border text-blue-600 hover:bg-blue-50"} transition-colors`}
      >
        <Paperclip className="w-3 h-3 shrink-0" />
        <span className="truncate max-w-[180px]">{attachment.name}</span>
        <span className="opacity-60 shrink-0">↓</span>
      </a>
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

  const { data: convsData, isLoading: isLoadingConvs } = useGetConversations({ status: "open" });

  const { data: msgsData } = useGetMessages(activeConvId || "", {
    query: { enabled: !!activeConvId }
  });

  const sendMutation = useSendMessage();

  useEffect(() => {
    const token = localStorage.getItem("flychat_token");
    if (!token) return;

    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("new_message", (data: { conversationId: string; message: { id: string; content: string; sender: string; createdAt: string } }) => {
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
      queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(data.conversationId) });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeConvId) return;
    socket.emit("join_conversation", activeConvId);
    return () => {
      socket.emit("leave_conversation", activeConvId);
    };
  }, [activeConvId]);

  const activeConv = convsData?.conversations?.find(c => c.id === activeConvId) as ConversationWithWidget | undefined;

  const handleSend = async () => {
    if ((!msgInput.trim() && !selectedFile) || !activeConvId) return;

    let attachment: FileAttachment | null = null;

    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert("File too large. Maximum size is 10MB.");
        return;
      }
      try {
        setIsUploading(true);
        attachment = await uploadFileToStorage(selectedFile);
      } catch (err) {
        alert("Failed to upload file. Please try again.");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    const content = msgInput.trim() || (attachment ? `📎 ${attachment.name}` : "");

    sendMutation.mutate(
      { id: activeConvId, data: { content, attachment } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(activeConvId) });
          queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey({ status: "open" }) });
        },
      }
    );
    setMsgInput("");
    setSelectedFile(null);
  };

  return (
    <AppLayout>
      <div className="flex-1 flex h-full bg-background overflow-hidden">
        {/* Left Panel: Conversation List */}
        <div className="w-80 flex flex-col border-r border-border bg-card z-10 shrink-0">
          <div className="p-4 border-b border-border/50">
            <h2 className="text-lg font-bold mb-4">{t("nav.inbox")}</h2>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("common.search")}
                className="w-full pl-9 pr-4 py-2 bg-secondary border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/30 outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isLoadingConvs ? (
              <div className="p-4 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : convsData?.conversations?.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full text-left p-3 rounded-xl transition-all ${activeConvId === conv.id ? "bg-primary/10 border-primary/20 shadow-sm" : "hover:bg-secondary/50 border-transparent"} border`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-sm text-foreground truncate">{conv.customerName}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {format(new Date(conv.updatedAt), 'HH:mm')}
                  </span>
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

        {/* Right Panel: Active Chat */}
        {activeConv ? (
          <div className="flex-1 flex flex-col h-full bg-white relative">
            {/* Chat Header */}
            <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold">
                  {activeConv.customerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-foreground leading-tight">{activeConv.customerName}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span> Online via {activeConv.channel}
                    {activeConv.sourcePageUrl && (() => {
                      try {
                        const hostname = new URL(activeConv.sourcePageUrl).hostname;
                        return (
                          <span className="flex items-center gap-1 ml-2 text-blue-500" title={activeConv.sourcePageUrl}>
                            <Globe className="w-3 h-3" />
                            <span className="truncate max-w-[200px]">{hostname}</span>
                          </span>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="px-4 py-2 bg-primary/10 text-primary font-bold text-sm rounded-xl hover:bg-primary/20 flex items-center gap-2 transition-colors">
                  <ShoppingBag className="w-4 h-4" /> Create Order
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#f8fafc]">
              {msgsData?.messages.map((msg) => {
                const isCustomer = msg.sender === 'customer';
                const metadata = msg.metadata as any;
                const attachment: FileAttachment | null = metadata?.attachment ?? null;

                return (
                  <div key={msg.id} className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[70%] rounded-2xl px-5 py-3 shadow-sm ${
                      isCustomer
                        ? "bg-white border border-border/50 text-foreground rounded-tl-sm"
                        : "bg-primary text-primary-foreground rounded-tr-sm"
                    }`}>
                      {attachment && <FilePreview attachment={attachment} isAgent={!isCustomer} />}
                      {msg.content && msg.content !== `📎 ${attachment?.name}` && (
                        <p className="text-sm">{msg.content}</p>
                      )}
                      {msg.content && msg.content === `📎 ${attachment?.name}` && !attachment && (
                        <p className="text-sm">{msg.content}</p>
                      )}
                      <span className={`text-[10px] mt-2 block ${isCustomer ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                        {format(new Date(msg.createdAt), 'HH:mm')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat Input */}
            <div className="p-4 bg-white border-t border-border shrink-0">
              {selectedFile && (
                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs flex justify-between items-center">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Paperclip className="w-3 h-3" />
                    <span className="truncate max-w-[300px]">{selectedFile.name}</span>
                    <span className="text-blue-500">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="text-blue-400 hover:text-blue-600 ml-2 shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-3 bg-secondary/30 border border-border rounded-2xl p-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-10 h-10 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0"
                  title="Attach file or photo"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea
                  value={msgInput}
                  onChange={e => setMsgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  className="flex-1 bg-transparent border-none outline-none resize-none p-2 text-sm max-h-32 min-h-10"
                  placeholder="Type a message or / for quick replies..."
                  rows={1}
                />
                <button
                  onClick={handleSend}
                  disabled={(!msgInput.trim() && !selectedFile) || sendMutation.isPending || isUploading}
                  className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0 mb-0.5 mr-0.5"
                >
                  {isUploading || sendMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4 ml-0.5" />}
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

        {/* Far Right Panel: Customer Context */}
        {activeConv && (
          <div className="w-72 border-l border-border bg-card hidden xl:flex flex-col shrink-0">
            <div className="p-5 border-b border-border/50 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 mx-auto rounded-full flex items-center justify-center mb-4">
                <User className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="font-bold text-lg">{activeConv.customerName}</h3>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
                <Phone className="w-3 h-3" /> {activeConv.customerPhone || "No phone"}
              </p>
            </div>
            <div className="p-5 space-y-6 flex-1 overflow-y-auto">
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">CRM Context</h4>
                <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Orders</span>
                    <span className="font-bold text-foreground">0</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">New Lead</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
