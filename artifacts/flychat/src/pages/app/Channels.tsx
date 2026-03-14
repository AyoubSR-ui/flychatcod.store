import { AppLayout } from "@/components/AppLayout";
import { MessageSquare, CheckCircle2, XCircle, Clock, AlertCircle, ExternalLink, Play } from "lucide-react";
import { useGetChannels } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";

const CHANNEL_META = {
  widget: {
    name: "Website Widget",
    icon: "💬",
    description: "Embed a floating chat widget on your website. Customers can start a chat and place COD orders directly from your store.",
    color: "from-blue-500 to-blue-600",
  },
  whatsapp: {
    name: "WhatsApp",
    icon: "📱",
    description: "Connect your WhatsApp Business account to receive and respond to customer messages. Requires Meta Business verification.",
    color: "from-green-500 to-green-600",
  },
  instagram: {
    name: "Instagram DMs",
    icon: "📸",
    description: "Manage Instagram Direct Messages alongside your other conversations. Requires a connected Instagram Business account.",
    color: "from-pink-500 to-rose-500",
  },
  messenger: {
    name: "Facebook Messenger",
    icon: "💙",
    description: "Handle Facebook Messenger conversations from your Page. Requires a connected Facebook Business Page.",
    color: "from-blue-600 to-indigo-600",
  },
} as const;

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
  const { data, isLoading } = useGetChannels();
  const { t } = useI18n();

  const channelMap = Object.fromEntries((data?.channels || []).map(c => [c.channel, c]));

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.channels")}</h1>
            <p className="text-muted-foreground mt-1">Connect messaging channels to receive all conversations in one inbox.</p>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">{t("common.loading")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(["widget","whatsapp","instagram","messenger"] as const).map((ch) => {
                const meta = CHANNEL_META[ch];
                const conn = channelMap[ch];
                const isActive = conn?.status === "connected";
                const isComingSoon = ch !== "widget";

                return (
                  <div key={ch} className={`bg-card border rounded-2xl shadow-sm overflow-hidden ${isActive ? "border-primary/30" : "border-border"}`}>
                    <div className={`h-2 bg-gradient-to-r ${meta.color}`} />
                    <div className="p-6 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-3xl">{meta.icon}</div>
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
                            <span className="font-semibold text-foreground">Integration ready</span> — The architecture for {meta.name} is in place. Full {ch === "whatsapp" ? "Meta Embedded Signup" : "OAuth connection"} will be available in a future update.
                          </p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-2 border-t border-border">
                        <button
                          disabled={isComingSoon}
                          className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                            isActive ? "bg-secondary text-foreground hover:bg-secondary/80" :
                            isComingSoon ? "bg-secondary/50 text-muted-foreground cursor-not-allowed" :
                            "bg-primary text-white hover:bg-primary/90"
                          }`}
                        >
                          {isActive ? "Manage" : isComingSoon ? "Not Available Yet" : "Connect"}
                        </button>
                        <button className="px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary flex items-center gap-1.5 text-muted-foreground">
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
    </AppLayout>
  );
}
