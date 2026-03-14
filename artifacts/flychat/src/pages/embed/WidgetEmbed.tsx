import { useState, useEffect, useRef, useCallback } from "react";

const dict: Record<string, Record<string, string>> = {
  en: {
    typing: "Type a message...",
    send: "Send",
    loading: "Loading...",
    error: "Something went wrong. Please try again.",
    poweredBy: "Powered by FlyChat",
  },
  fr: {
    typing: "Tapez un message...",
    send: "Envoyer",
    loading: "Chargement...",
    error: "Une erreur est survenue. Veuillez réessayer.",
    poweredBy: "Propulsé par FlyChat",
  },
};

interface WidgetMessage {
  id: string;
  content: string;
  sender: "customer" | "agent" | "bot" | "system";
  createdAt: string;
}

interface WidgetConfig {
  storeId: string;
  storeName: string;
  welcomeMessageEn: string;
  welcomeMessageFr: string;
  defaultLanguage: string;
  primaryColor: string;
  position: string;
}

const API_BASE = "/api/widget/public";

function getSearchParam(key: string): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(key) || "";
}

export default function WidgetEmbed() {
  const storeId = getSearchParam("storeId");
  const langParam = getSearchParam("lang") || "fr";
  const lang = langParam === "en" ? "en" : "fr";
  const t = dict[lang] || dict.fr;

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!storeId) { setError("Missing storeId"); setLoading(false); return; }
    init();
  }, [storeId]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function init() {
    try {
      const cfgRes = await fetch(`${API_BASE}/config/${storeId}`);
      if (!cfgRes.ok) { setError(t.error); setLoading(false); return; }
      const cfgData = await cfgRes.json();
      setConfig(cfgData);

      let vid = localStorage.getItem("flychat_visitor_id");
      if (!vid) {
        const sessRes = await fetch(`${API_BASE}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            language: lang,
            currentPageUrl: document.referrer || undefined,
          }),
        });
        if (!sessRes.ok) { setError(t.error); setLoading(false); return; }
        const sessData = await sessRes.json();
        vid = sessData.visitorId;
        localStorage.setItem("flychat_visitor_id", vid!);
      }
      setVisitorId(vid);

      let cid = localStorage.getItem(`flychat_conversation_${storeId}`);

      if (cid) {
        const msgRes = await fetch(`${API_BASE}/conversations/${cid}/messages?visitorId=${encodeURIComponent(vid!)}`);
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMessages(msgData.messages || []);
          setConversationId(cid);
          setLoading(false);
          startPolling(cid, vid!);
          return;
        }
        localStorage.removeItem(`flychat_conversation_${storeId}`);
      }

      const convRes = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          visitorId: vid,
          language: lang,
          currentPageUrl: document.referrer || undefined,
        }),
      });
      if (!convRes.ok) { setError(t.error); setLoading(false); return; }
      const convData = await convRes.json();
      cid = convData.conversationId;
      localStorage.setItem(`flychat_conversation_${storeId}`, cid!);
      setConversationId(cid);

      if (convData.resumed) {
        const msgRes = await fetch(`${API_BASE}/conversations/${cid}/messages?visitorId=${encodeURIComponent(vid!)}`);
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMessages(msgData.messages || []);
        }
      }

      setLoading(false);
      startPolling(cid!, vid!);
    } catch {
      setError(t.error);
      setLoading(false);
    }
  }

  function startPolling(cid: string, vid: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/conversations/${cid}/messages?visitorId=${encodeURIComponent(vid)}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch {}
    }, 4000);
  }

  async function handleSend() {
    if (!input.trim() || !conversationId || !visitorId || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    const optimistic: WidgetMessage = {
      id: "temp-" + Date.now(),
      content,
      sender: "customer",
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, content, language: lang }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => prev.map(m => m.id === optimistic.id ? msg : m));
      }
    } catch {}
    setSending(false);
  }

  const primaryColor = config?.primaryColor || "#2563eb";
  const welcomeMessage = lang === "en" ? config?.welcomeMessageEn : config?.welcomeMessageFr;
  const storeName = config?.storeName || "Chat";

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${primaryColor}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <span>{t.loading}</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", background: "#f8fafc", padding: 24 }}>
        <div style={{ textAlign: "center", color: "#ef4444", fontSize: 14 }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8fafc", overflow: "hidden" }}>
      <div style={{ background: primaryColor, color: "#fff", padding: "16px 20px", flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{storeName}</div>
        {welcomeMessage && <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{welcomeMessage}</div>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, marginTop: 40 }}>
            {lang === "en" ? "Send a message to start chatting!" : "Envoyez un message pour commencer!"}
          </div>
        )}
        {messages.map((msg) => {
          const isCustomer = msg.sender === "customer";
          return (
            <div key={msg.id} style={{ display: "flex", justifyContent: isCustomer ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: isCustomer ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: isCustomer ? primaryColor : "#fff",
                color: isCustomer ? "#fff" : "#1e293b",
                fontSize: 14,
                lineHeight: "1.5",
                boxShadow: isCustomer ? "none" : "0 1px 3px rgba(0,0,0,0.08)",
                border: isCustomer ? "none" : "1px solid #e2e8f0",
                wordBreak: "break-word",
              }}>
                {msg.content}
                <div style={{
                  fontSize: 10,
                  marginTop: 4,
                  opacity: 0.7,
                  textAlign: "right",
                }}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: "12px", borderTop: "1px solid #e2e8f0", background: "#fff", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={t.typing}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 14,
              outline: "none",
              fontFamily: "inherit",
              maxHeight: 80,
              lineHeight: "1.4",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: !input.trim() || sending ? "#cbd5e1" : primaryColor,
              border: "none",
              color: "#fff",
              cursor: !input.trim() || sending ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
          {t.poweredBy}
        </div>
      </div>
    </div>
  );
}
