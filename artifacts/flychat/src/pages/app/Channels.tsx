import { useState, useEffect, type ReactNode } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CheckCircle2, XCircle, Clock, AlertCircle, ExternalLink, Play, X } from "lucide-react";
import { useGetChannels } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";
import WidgetGuideVideo from "@/components/WidgetGuideVideo";

const WidgetIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill="#2563EB" />
    <path d="M28 12H12C10.9 12 10 12.9 10 14V30L14 26H28C29.1 26 30 25.1 30 24V14C30 12.9 29.1 12 28 12Z" fill="white" />
    <circle cx="16" cy="19" r="1.5" fill="#2563EB" />
    <circle cx="20" cy="19" r="1.5" fill="#2563EB" />
    <circle cx="24" cy="19" r="1.5" fill="#2563EB" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill="#25D366" />
    <path d="M20 8C13.373 8 8 13.373 8 20C8 22.286 8.674 24.42 9.84 26.222L8.292 31.708L13.908 30.19C15.636 31.232 17.748 31.838 20 31.838C26.627 31.838 32 26.627 32 20C32 13.373 26.627 8 20 8Z" fill="white" />
    <path d="M20 9.5C14.201 9.5 9.5 14.201 9.5 20C9.5 22.127 10.16 24.104 11.28 25.754L10.08 29.92L14.356 28.74C15.938 29.734 17.81 30.338 20 30.338C25.799 30.338 30.5 25.799 30.5 20C30.5 14.201 25.799 9.5 20 9.5Z" fill="#25D366" />
    <path d="M15.6 13.4C15.34 12.8 15.06 12.78 14.82 12.76H14.22C13.96 12.76 13.54 12.86 13.18 13.26C12.82 13.66 11.8 14.62 11.8 16.58C11.8 18.54 13.22 20.44 13.42 20.7C13.62 20.96 16.22 25.18 20.34 26.78C23.74 28.1 24.46 27.82 25.18 27.74C25.9 27.66 27.5 26.82 27.82 25.94C28.14 25.06 28.14 24.3 28.06 24.16C27.98 24.02 27.72 23.94 27.34 23.74C26.96 23.54 25.02 22.6 24.68 22.48C24.34 22.36 24.08 22.3 23.82 22.68C23.56 23.06 22.82 23.94 22.58 24.18C22.34 24.44 22.12 24.46 21.74 24.28C21.36 24.08 20.06 23.66 18.54 22.3C17.36 21.26 16.56 19.96 16.32 19.58C16.08 19.2 16.3 18.98 16.48 18.8C16.64 18.64 16.86 18.36 17.04 18.12C17.22 17.88 17.28 17.7 17.4 17.44C17.52 17.18 17.46 16.94 17.36 16.74C17.26 16.54 16.5 14.56 15.6 13.4Z" fill="white" />
  </svg>
);

const InstagramIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
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
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
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
    description: "Connect your WhatsApp Business account to receive and respond to customer messages. Requires Meta Business verification.",
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

export default function Channels() {
  const { data, isLoading, refetch } = useGetChannels();
  const { t } = useI18n();
  const [guideOpen, setGuideOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

  // Handle OAuth callback result from URL params
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

 // Listen for popup close to refresh channels
  const handleConnect = (ch: string) => {
    if (ch === "instagram" || ch === "messenger") {
      const token = localStorage.getItem("flychat_token") || "";
      const popup = window.open(
        `${API_BASE}/api/${ch}/oauth/start?token=${token}`,
        `${ch}_oauth`,
        "width=600,height=700,scrollbars=yes"
      );
      const timer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(timer);
          refetch();
        }
      }, 500);
    }
  };
  const handleDisconnect = async (ch: string) => {
    if (ch === "instagram" || ch === "messenger") {
      const token = localStorage.getItem("flychat_token") || "";
      await fetch(`${API_BASE}/api/${ch}/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      refetch();
    }
  };

  const channelMap = Object.fromEntries((data?.channels || []).map(c => [c.channel, c]));

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
            </div>
          )}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium">
              <AlertCircle className="w-4 h-4" /> {errorMsg}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">{t("common.loading")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(["widget","whatsapp","instagram","messenger"] as const).map((ch) => {
                const meta = CHANNEL_META[ch];
                const conn = channelMap[ch];
                const isActive = conn?.status === "connected";
                const isComingSoon = false;

                return (
                  <div key={ch} className={`bg-card border rounded-2xl shadow-sm overflow-hidden ${isActive ? "border-primary/30" : "border-border"}`}>
                    <div className={`h-2 bg-gradient-to-r ${meta.color}`} />
                    <div className="p-6 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="shrink-0">{meta.icon}</div>
                          <div>
                            <h3 className="font-bold text-foreground">{meta.name}</h3>
                            <div className="mt-1">
                              <StatusBadge status={conn?.status || "disconnected"} />
                            </div>
                          </div>
                        </div>
                        {isComingSoon && (
                          <span className="px-2.5 py-1 bg-secondary text-muted-foreground text-xs font-bold rounded-full border border-border">Coming Soon</span>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground">{meta.description}</p>

                      {isComingSoon && (
                        <div className="bg-secondary/50 border border-border rounded-xl p-3">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">Integration ready</span> — The architecture for {meta.name} is in place. Full OAuth connection will be available in a future update.
                          </p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-2 border-t border-border">
                        <button
                          disabled={isComingSoon}
                          onClick={() => {
                            if (isActive && ch !== "widget") handleDisconnect(ch);
                            else if (!isActive && !isComingSoon) handleConnect(ch);
                          }}
                          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                            isActive
                              ? ch === "widget"
                                ? "bg-secondary text-foreground hover:bg-secondary/80"
                                : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                              : isComingSoon
                              ? "bg-secondary/50 text-muted-foreground cursor-not-allowed"
                              : "bg-primary text-white hover:bg-primary/90"
                          }`}
                        >
                          {isActive ? (ch === "widget" ? "Manage" : "Disconnect") : isComingSoon ? "Not Available Yet" : "Connect"}
                        </button>
                        <button
                          onClick={() => meta.hasGuide && setGuideOpen(true)}
                          className={`px-3 py-2 border rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all ${
                            meta.hasGuide
                              ? "border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50"
                              : "border-border text-muted-foreground opacity-40 cursor-not-allowed"
                          }`}
                        >
                          <Play className="w-3 h-3" /> Guide
                        </button>
                        {!isComingSoon && (
                          <button className="px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">
                            <ExternalLink className="w-4 h-4 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {guideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-white/10"
            style={{ aspectRatio: "16/9" }}
            onClick={e => e.stopPropagation()}
          >
            <WidgetGuideVideo />
            <button
              onClick={() => setGuideOpen(false)}
              className="absolute top-3 right-3 z-20 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}