import { useState, useEffect, type ReactNode } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CheckCircle2, XCircle, Clock, AlertCircle, ExternalLink, Play, X, Loader2, Phone, PhoneCall } from "lucide-react";
import { useGetChannels } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";
import WidgetGuideVideo from "@/components/WidgetGuideVideo";

// ─── Icons ────────────────────────────────────────────────────────────────────

const WidgetIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="#2563EB" />
    <path d="M28 12H12C10.9 12 10 12.9 10 14V30L14 26H28C29.1 26 30 25.1 30 24V14C30 12.9 29.1 12 28 12Z" fill="white" />
    <circle cx="16" cy="19" r="1.5" fill="#2563EB" />
    <circle cx="20" cy="19" r="1.5" fill="#2563EB" />
    <circle cx="24" cy="19" r="1.5" fill="#2563EB" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="#25D366" />
    <path d="M20 8C13.373 8 8 13.373 8 20C8 22.286 8.674 24.42 9.84 26.222L8.292 31.708L13.908 30.19C15.636 31.232 17.748 31.838 20 31.838C26.627 31.838 32 26.627 32 20C32 13.373 26.627 8 20 8Z" fill="white" />
    <path d="M20 9.5C14.201 9.5 9.5 14.201 9.5 20C9.5 22.127 10.16 24.104 11.28 25.754L10.08 29.92L14.356 28.74C15.938 29.734 17.81 30.338 20 30.338C25.799 30.338 30.5 25.799 30.5 20C30.5 14.201 25.799 9.5 20 9.5Z" fill="#25D366" />
    <path d="M15.6 13.4C15.34 12.8 15.06 12.78 14.82 12.76H14.22C13.96 12.76 13.54 12.86 13.18 13.26C12.82 13.66 11.8 14.62 11.8 16.58C11.8 18.54 13.22 20.44 13.42 20.7C13.62 20.96 16.22 25.18 20.34 26.78C23.74 28.1 24.46 27.82 25.18 27.74C25.9 27.66 27.5 26.82 27.82 25.94C28.14 25.06 28.14 24.3 28.06 24.16C27.98 24.02 27.72 23.94 27.34 23.74C26.96 23.54 25.02 22.6 24.68 22.48C24.34 22.36 24.08 22.3 23.82 22.68C23.56 23.06 22.82 23.94 22.58 24.18C22.34 24.44 22.12 24.46 21.74 24.28C21.36 24.08 20.06 23.66 18.54 22.3C17.36 21.26 16.56 19.96 16.32 19.58C16.08 19.2 16.3 18.98 16.48 18.8C16.64 18.64 16.86 18.36 17.04 18.12C17.22 17.88 17.28 17.7 17.4 17.44C17.52 17.18 17.46 16.94 17.36 16.74C17.26 16.54 16.5 14.56 15.6 13.4Z" fill="white" />
  </svg>
);

const InstagramIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <defs>
      <linearGradient id="ig-grad" x1="5" y1="35" x2="35" y2="5" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FED373" />
        <stop offset="15%" stopColor="#F15245" />
        <stop offset="30%" stopColor="#D92E7F" />
        <stop offset="50%" stopColor="#BC2A8D" />
        <stop offset="70%" stopColor="#8A3AB9" />
        <stop offset="100%" stopColor="#4C68D7" />
      </linearGradient>
    </defs>
    <rect width="40" height="40" rx="10" fill="url(#ig-grad)" />
    <rect x="10" y="10" width="20" height="20" rx="6" stroke="white" strokeWidth="2" fill="none" />
    <circle cx="20" cy="20" r="5" stroke="white" strokeWidth="2" fill="none" />
    <circle cx="26.5" cy="13.5" r="1.5" fill="white" />
  </svg>
);

const MessengerIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <defs>
      <linearGradient id="msg-grad" x1="20" y1="4" x2="20" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#00B2FF" />
        <stop offset="100%" stopColor="#006AFF" />
      </linearGradient>
    </defs>
    <rect width="40" height="40" rx="10" fill="url(#msg-grad)" />
    <path d="M20 8C13.373 8 8 12.925 8 19C8 22.344 9.736 25.318 12.4 27.2V32L16.88 29.524C17.88 29.8 18.92 29.944 20 29.944C26.627 29.944 32 25.019 32 18.944C32 12.925 26.627 8 20 8Z" fill="white" />
    <path d="M14 23L17.6 18.4L20.2 20.6L26 14.8" stroke="url(#msg-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// ─── Channel metadata ─────────────────────────────────────────────────────────

const CHANNEL_META: Record<string, { name: string; icon: ReactNode; description: string; color: string; hasGuide: boolean }> = {
  widget: {
    name: "Website Widget",
    icon: <WidgetIcon />,
    description: "Embed a floating chat widget on your website. Customers can start a chat and place COD orders directly from your store.",
    color: "from-blue-500 to-blue-600",
    hasGuide: true,
  },
  whatsapp: {
    name: "WhatsApp",
    icon: <WhatsAppIcon />,
    description: "Connect your WhatsApp Business account to receive and respond to customer messages. Requires a permanent WhatsApp Cloud API token.",
    color: "from-green-500 to-green-600",
    hasGuide: false,
  },
  instagram: {
    name: "Instagram DMs",
    icon: <InstagramIcon />,
    description: "Manage Instagram Direct Messages alongside your other conversations. Requires a connected Instagram Business account.",
    color: "from-pink-500 to-rose-500",
    hasGuide: false,
  },
  messenger: {
    name: "Facebook Messenger",
    icon: <MessengerIcon />,
    description: "Handle Facebook Messenger conversations from your Page. Requires a connected Facebook Business Page.",
    color: "from-blue-600 to-indigo-600",
    hasGuide: false,
  },
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; color: string; icon: any }> = {
    connected: { label: "Connected", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
    disconnected: { label: "Disconnected", color: "bg-gray-100 text-gray-600 border-gray-200", icon: XCircle },
    pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
    error: { label: "Error", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
  };
  const s = map[status] || map.disconnected;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${s.color}`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
};

// ─── WhatsApp Connect Modal ───────────────────────────────────────────────────

function WhatsAppModal({ onClose, onSuccess, apiBase }: {
  onClose: () => void;
  onSuccess: () => void;
  apiBase: string;
}) {
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!accessToken.trim()) { setError("Access token is required."); return; }
    if (!phoneNumberId.trim()) { setError("Phone Number ID is required."); return; }
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("flychat_token") || "";
      const res = await fetch(`${apiBase}/api/whatsapp/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accessToken: accessToken.trim(), phoneNumberId: phoneNumberId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to connect WhatsApp.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WhatsAppIcon />
            <div>
              <h2 className="font-bold text-foreground text-lg">Connect WhatsApp</h2>
              <p className="text-xs text-muted-foreground">WhatsApp Cloud API</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Permanent Access Token</label>
            <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAAxxxxxxxxxxxxxxx..."
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <p className="text-xs text-muted-foreground">Get this from Meta Business Suite → WhatsApp → API Setup → Permanent Token.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Phone Number ID</label>
            <input type="text" value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="989761010895675"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            <p className="text-xs text-muted-foreground">Found in Meta Business Suite → WhatsApp → API Setup → Phone Number ID.</p>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Voice Calls Modal ────────────────────────────────────────────────────────

function VoiceCallModal({ onClose, onSuccess, apiBase }: {
  onClose: () => void;
  onSuccess: (phone: string) => void;
  apiBase: string;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");

  const handleSendOtp = async () => {
    if (!phone.trim()) { setError("Phone number is required."); return; }
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("flychat_token") || "";
      const res = await fetch(`${apiBase}/api/voice/verify-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send OTP");
      setVerifiedPhone(data.phone);
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOtp = async () => {
    if (!otp.trim()) { setError("Verification code is required."); return; }
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("flychat_token") || "";
      const res = await fetch(`${apiBase}/api/voice/verify-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: verifiedPhone, code: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Invalid code");
      onSuccess(verifiedPhone);
      onClose();
    } catch (err: any) {
      setError(err.message || "Invalid verification code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-lg">AI Voice Calls</h2>
              <p className="text-xs text-muted-foreground">Verify your caller phone number</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {step === "phone" ? (
          <>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-xs">
              <p className="font-bold mb-1">How it works:</p>
              <p>Enter your Algerian phone number. We'll send you an SMS code to verify it. Once verified, the AI will use this number to call your customers for order confirmation.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Your Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="0555 000 000 or +213555000000"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              <p className="text-xs text-muted-foreground">Customers will see this number when AI calls them for order confirmation.</p>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-xs">
              <p>Verification code sent to <strong>{verifiedPhone}</strong>. Enter the code below.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Verification Code</label>
              <input type="text" value={otp} onChange={e => setOtp(e.target.value)}
                placeholder="123456" maxLength={6}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-center text-xl tracking-widest font-bold" />
            </div>
            <button onClick={() => { setStep("phone"); setError(""); }} className="text-xs text-primary hover:underline">
              ← Use a different number
            </button>
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors">Cancel</button>
          <button onClick={step === "phone" ? handleSendOtp : handleConfirmOtp} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Please wait..." : step === "phone" ? "Send Code" : "Verify & Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Channels() {
  const { data, isLoading, refetch } = useGetChannels();
  const { t } = useI18n();
  const [guideOpen, setGuideOpen] = useState(false);
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<any>(null);

  const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    if (success === "instagram_connected") {
      setSuccessMsg("Instagram DMs connected successfully!");
      refetch();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (success === "messenger_connected") {
      setSuccessMsg("Facebook Messenger connected successfully!");
      refetch();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      setErrorMsg("Connection failed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refetch]);

  // Fetch voice status
  useEffect(() => {
    const token = localStorage.getItem("flychat_token") || "";
    fetch(`${API_BASE}/api/voice/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setVoiceStatus(data))
      .catch(() => {});
  }, []);

  const handleConnect = (ch: string) => {
    if (ch === "whatsapp") { setWaModalOpen(true); return; }
    if (ch === "instagram" || ch === "messenger") {
      const token = localStorage.getItem("flychat_token") || "";
      const popup = window.open(`${API_BASE}/api/${ch}/oauth/start?token=${token}`, `${ch}_oauth`, "width=600,height=700,scrollbars=yes");
      const timer = setInterval(() => {
        if (popup?.closed) { clearInterval(timer); refetch(); }
      }, 500);
    }
  };

  const handleDisconnect = async (ch: string) => {
    if (ch === "widget") return;
    const token = localStorage.getItem("flychat_token") || "";
    try {
      await fetch(`${API_BASE}/api/${ch}/disconnect`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      setSuccessMsg(`${CHANNEL_META[ch]?.name || ch} disconnected.`);
      refetch();
    } catch {
      setErrorMsg("Failed to disconnect. Please try again.");
    }
  };

  const channelMap = Object.fromEntries((data?.channels || []).map(c => [c.channel, c]));

  function getAccountLabel(ch: string, conn: any): string | null {
    if (!conn || conn.status !== "connected") return null;
    const meta = (conn.metadata ?? {}) as Record<string, unknown>;
    if (ch === "messenger") return meta.pageName as string || null;
    if (ch === "whatsapp") return conn.externalAccountId ? `Phone ID: ${conn.externalAccountId}` : null;
    if (ch === "instagram") {
      const username = meta.username as string;
      if (username) return `@${username}`;
      return conn.externalAccountId && conn.externalAccountId !== "pending" ? `ID: ${conn.externalAccountId}` : "Pending first message";
    }
    if (ch === "widget") return "Embedded on your website";
    return null;
  }

  const voiceConnected = voiceStatus?.callerPhone;
  const voiceCallsRemaining = voiceStatus?.callsRemaining ?? 0;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.channels")}</h1>
            <p className="text-muted-foreground mt-1">Connect messaging channels to receive all conversations in one inbox.</p>
          </div>

          {successMsg && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> {successMsg}
              <button onClick={() => setSuccessMsg("")} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium">
              <AlertCircle className="w-4 h-4" /> {errorMsg}
              <button onClick={() => setErrorMsg("")} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">{t("common.loading")}</div>
          ) : (
            <>
              {/* Messaging channels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(["widget", "whatsapp", "instagram", "messenger"] as const).map((ch) => {
                  const meta = CHANNEL_META[ch];
                  const conn = channelMap[ch];
                  const isActive = conn?.status === "connected";

                  return (
                    <div key={ch} className={`bg-card border rounded-2xl shadow-sm overflow-hidden ${isActive ? "border-primary/30" : "border-border"}`}>
                      <div className={`h-2 bg-gradient-to-r ${meta.color}`} />
                      <div className="p-6 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="shrink-0">{meta.icon}</div>
                            <div>
                              <h3 className="font-bold text-foreground">{meta.name}</h3>
                              <div className="mt-1 flex flex-col gap-1">
                                <StatusBadge status={conn?.status || "disconnected"} />
                                {getAccountLabel(ch, conn) && (
                                  <span className="text-xs text-muted-foreground font-medium truncate max-w-[160px]">
                                    {getAccountLabel(ch, conn)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{meta.description}</p>
                        <div className="flex gap-3 pt-2 border-t border-border">
                          <button
                            onClick={() => { if (isActive) handleDisconnect(ch); else handleConnect(ch); }}
                            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                              isActive ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100" : "bg-primary text-white hover:bg-primary/90"
                            }`}>
                            {isActive ? "Disconnect" : "Connect"}
                          </button>
                          <button onClick={() => meta.hasGuide && setGuideOpen(true)}
                            className={`px-3 py-2 border rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all ${
                              meta.hasGuide ? "border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50" : "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                            }`}>
                            <Play className="w-3 h-3" /> Guide
                          </button>
                          <button className="px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">
                            <ExternalLink className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Voice Calls section */}
              <div>
                <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-orange-500" /> AI Voice Confirmation Calls
                </h2>
                <div className={`bg-card border rounded-2xl shadow-sm overflow-hidden ${voiceConnected ? "border-orange-200" : "border-border"}`}>
                  <div className="h-2 bg-gradient-to-r from-orange-400 to-red-500" />
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center shrink-0">
                          <PhoneCall className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground">AI Voice Calls</h3>
                          <div className="mt-1 flex flex-col gap-1">
                            <StatusBadge status={voiceConnected ? "connected" : "disconnected"} />
                            {voiceConnected && (
                              <span className="text-xs text-muted-foreground font-medium">{voiceConnected} · {voiceCallsRemaining} calls remaining</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Automatically call customers in Darija or French to confirm COD orders after AI captures them. Saves $0.50 per order vs manual confirmation agents.
                    </p>

                    {!voiceConnected && (
                      <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-orange-800 text-xs">
                        <p className="font-bold mb-1">How it works:</p>
                        <p>Verify your Algerian phone number → AI calls customers from your number → Customer presses 1 to confirm, 2 to cancel → Order status updates automatically.</p>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2 border-t border-border">
                      <button
                        onClick={() => {
                          if (voiceConnected) {
                            // Disconnect
                            const token = localStorage.getItem("flychat_token") || "";
                            fetch(`${API_BASE}/api/voice/verify-confirm`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
                              .then(() => setVoiceStatus((prev: any) => ({ ...prev, callerPhone: null })))
                              .catch(() => {});
                          } else {
                            setVoiceModalOpen(true);
                          }
                        }}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                          voiceConnected ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100" : "bg-orange-500 text-white hover:bg-orange-600"
                        }`}>
                        {voiceConnected ? "Disconnect" : "Connect Voice Calls"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {waModalOpen && (
        <WhatsAppModal apiBase={API_BASE} onClose={() => setWaModalOpen(false)}
          onSuccess={() => { setSuccessMsg("WhatsApp connected successfully!"); refetch(); }} />
      )}

      {voiceModalOpen && (
        <VoiceCallModal apiBase={API_BASE} onClose={() => setVoiceModalOpen(false)}
          onSuccess={(phone) => {
            setSuccessMsg(`Voice calls connected! AI will call customers from ${phone}`);
            setVoiceStatus((prev: any) => ({ ...prev, callerPhone: phone }));
          }} />
      )}

      {guideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setGuideOpen(false)}>
          <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-white/10" style={{ aspectRatio: "16/9" }} onClick={e => e.stopPropagation()}>
            <WidgetGuideVideo />
            <button onClick={() => setGuideOpen(false)}
              className="absolute top-3 right-3 z-20 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}