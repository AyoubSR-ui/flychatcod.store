import { AppLayout } from "@/components/AppLayout";
import { Plus, Zap, ToggleRight, ToggleLeft, Trash2, Bot, Info, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  useGetAutomationRules, useCreateAutomationRule, useUpdateAutomationRule, useDeleteAutomationRule,
  useGetTeamMembers,
} from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";

// ─── Trigger / Action metadata ────────────────────────────────────────────────

const TRIGGER_META: Record<string, { label: string; description: string; live: boolean; configFields: string[] }> = {
  new_conversation: {
    label: "New Conversation",
    description: "When a visitor starts a new chat",
    live: true,
    configFields: [],
  },
  keyword: {
    label: "New Message / Keyword",
    description: "When a customer sends a message (optional keyword filter)",
    live: true,
    configFields: ["keyword", "matchType"],
  },
  inactivity: {
    label: "Visitor Inactivity",
    description: "When a visitor is inactive for X minutes",
    live: true,
    configFields: ["delayMinutes"],
  },
  order_created: {
    label: "Order Created",
    description: "When an order is created from a conversation",
    live: true,
    configFields: [],
  },
};

const ACTION_META: Record<string, { label: string; description: string; live: boolean; configFields: string[] }> = {
  send_message: {
    label: "Send Message",
    description: "Send an automated message to the visitor",
    live: true,
    configFields: ["message"],
  },
  assign_agent: {
    label: "Assign to Agent",
    description: "Assign the conversation to a team member",
    live: true,
    configFields: ["agentId"],
  },
  add_tag: {
    label: "Add Tag",
    description: "Add a label to the conversation",
    live: true,
    configFields: ["tag"],
  },
  create_order_flow: {
    label: "Start Order Flow",
    description: "Initiate guided order creation",
    live: false,
    configFields: [],
  },
  escalate: {
    label: "Escalate to Human",
    description: "Flag the conversation for urgent human review",
    live: false,
    configFields: [],
  },
};

function LiveBadge({ live }: { live: boolean }) {
  if (live) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full border border-green-200">
        <CheckCircle2 className="w-2.5 h-2.5" /> Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full border border-amber-200">
      <Clock className="w-2.5 h-2.5" /> Soon
    </span>
  );
}

function configSummary(rule: any): string {
  const cfg = rule.config || {};
  const parts: string[] = [];
  if (cfg.keyword) parts.push(`keyword: "${cfg.keyword}"`);
  if (cfg.delayMinutes) parts.push(`after ${cfg.delayMinutes}m`);
  if (cfg.message) parts.push(`"${String(cfg.message).slice(0, 50)}${String(cfg.message).length > 50 ? "…" : ""}"`);
  if (cfg.message_en) parts.push(`"${String(cfg.message_en).slice(0, 50)}…"`);
  if (cfg.tag) parts.push(`tag: "${cfg.tag}"`);
  return parts.join(" · ");
}

// ─── Component ────────────────────────────────────────────────────────────────

type TriggerKey = keyof typeof TRIGGER_META;
type ActionKey = keyof typeof ACTION_META;

interface RuleForm {
  name: string;
  trigger: TriggerKey;
  action: ActionKey;
  isActive: boolean;
  config: Record<string, unknown>;
}

const DEFAULT_FORM: RuleForm = {
  name: "",
  trigger: "new_conversation",
  action: "send_message",
  isActive: true,
  config: {},
};

export default function Automation() {
  const { data, isLoading, refetch } = useGetAutomationRules();
  const createRule = useCreateAutomationRule();
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const { data: teamData } = useGetTeamMembers();

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(DEFAULT_FORM);
  const { t } = useI18n();

  const teamMembers = teamData?.members ?? [];

  const setConfig = (key: string, value: unknown) =>
    setForm(f => ({ ...f, config: { ...f.config, [key]: value } }));

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setShowModal(true);
  };

  const openEdit = (rule: any) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      trigger: rule.trigger,
      action: rule.action,
      isActive: rule.isActive,
      config: rule.config || {},
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editingId) {
      await updateRule.mutateAsync({ id: editingId, data: { name: form.name, isActive: form.isActive, config: form.config } });
    } else {
      await createRule.mutateAsync({ data: { name: form.name, trigger: form.trigger as any, action: form.action as any, isActive: form.isActive, config: form.config } });
    }
    setShowModal(false);
    setForm(DEFAULT_FORM);
    setEditingId(null);
    refetch();
  };

  const handleToggle = async (rule: any) => {
    await updateRule.mutateAsync({ id: rule.id, data: { isActive: !rule.isActive } });
    refetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    await deleteRule.mutateAsync({ id });
    refetch();
  };

  const triggerMeta = TRIGGER_META[form.trigger] ?? TRIGGER_META.new_conversation;
  const actionMeta = ACTION_META[form.action] ?? ACTION_META.send_message;

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.automation")}</h1>
                <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full border border-green-200">Engine Live</span>
              </div>
              <p className="text-muted-foreground mt-1">Rules execute automatically when triggers fire. All triggers and actions marked Live are working.</p>
            </div>
            <button onClick={openCreate} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Rule
            </button>
          </div>

          {/* Supported triggers/actions overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Supported Triggers</h3>
              <div className="space-y-2">
                {Object.entries(TRIGGER_META).map(([key, meta]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{meta.label}</span>
                      <p className="text-[11px] text-muted-foreground">{meta.description}</p>
                    </div>
                    <LiveBadge live={meta.live} />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Supported Actions</h3>
              <div className="space-y-2">
                {Object.entries(ACTION_META).map(([key, meta]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{meta.label}</span>
                      <p className="text-[11px] text-muted-foreground">{meta.description}</p>
                    </div>
                    <LiveBadge live={meta.live} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rules list */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Your Rules</h2>
            {isLoading ? (
              <div className="text-center py-10 text-muted-foreground">{t("common.loading")}</div>
            ) : !data?.rules?.length ? (
              <div className="bg-card border border-border rounded-2xl p-10 text-center">
                <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="font-semibold text-foreground">No automation rules yet</p>
                <p className="text-sm text-muted-foreground mt-1">Create your first rule to automatically welcome visitors, respond to keywords, or follow up after inactivity.</p>
              </div>
            ) : data.rules.map((rule) => {
              const tMeta = TRIGGER_META[rule.trigger] ?? { label: rule.trigger, live: false };
              const aMeta = ACTION_META[rule.action] ?? { label: rule.action, live: false };
              const summary = configSummary(rule);
              return (
                <div key={rule.id} className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${rule.isActive ? "bg-primary/10" : "bg-secondary"}`}>
                    <Zap className={`w-5 h-5 ${rule.isActive ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{rule.name}</p>
                      {!tMeta.live && <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded border border-amber-200">trigger not yet live</span>}
                      {!aMeta.live && <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded border border-amber-200">action not yet live</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">When: <span className="font-medium text-foreground">{tMeta.label}</span></span>
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Then: <span className="font-medium text-foreground">{aMeta.label}</span></span>
                    </div>
                    {summary && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{summary}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${rule.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {rule.isActive ? "Active" : "Off"}
                    </span>
                    <button onClick={() => openEdit(rule)} className="p-2 hover:bg-secondary rounded-lg" title="Edit">
                      <Info className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleToggle(rule)} className="p-2 hover:bg-secondary rounded-lg" title={rule.isActive ? "Disable" : "Enable"}>
                      {rule.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                    </button>
                    <button onClick={() => handleDelete(rule.id)} className="p-2 hover:bg-red-50 rounded-lg" title="Delete">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI coming soon */}
          <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="font-bold text-violet-900">AI Automation — Coming Soon</p>
              <p className="text-sm text-violet-700 mt-1">Intent detection, order entity extraction, and AI-powered responses are on the roadmap. Current rules are structured and rule-based.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold">{editingId ? "Edit Rule" : "New Automation Rule"}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-secondary rounded-lg">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Rule Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Welcome new visitors"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background" />
              </div>

              {/* Trigger */}
              {!editingId && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Trigger
                    <span className="ml-2 normal-case font-normal text-muted-foreground">{triggerMeta.description}</span>
                  </label>
                  <select value={form.trigger} onChange={e => setForm(f => ({ ...f, trigger: e.target.value as TriggerKey, config: {} }))}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background">
                    {Object.entries(TRIGGER_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} {v.live ? "" : "⏳"}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action */}
              {!editingId && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Action
                    <span className="ml-2 normal-case font-normal text-muted-foreground">{actionMeta.description}</span>
                  </label>
                  <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value as ActionKey, config: {} }))}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background">
                    {Object.entries(ACTION_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} {v.live ? "" : "⏳"}</option>
                    ))}
                  </select>
                  {!actionMeta.live && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ This action is not yet implemented and will have no effect.</p>
                  )}
                </div>
              )}

              {/* Config fields — trigger-specific */}
              {(triggerMeta.configFields.includes("keyword") || editingId) && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Keyword Filter <span className="normal-case font-normal">(optional — leave blank to fire on every message)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={typeof form.config.keyword === "string" ? form.config.keyword : ""}
                      onChange={e => setConfig("keyword", e.target.value)}
                      placeholder="e.g. price, prix, livraison"
                      className="flex-1 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background" />
                    <select
                      value={typeof form.config.matchType === "string" ? form.config.matchType : "contains"}
                      onChange={e => setConfig("matchType", e.target.value)}
                      className="border border-border rounded-xl px-3 py-2 text-sm outline-none bg-background">
                      <option value="contains">Contains</option>
                      <option value="exact">Exact</option>
                    </select>
                  </div>
                </div>
              )}

              {(triggerMeta.configFields.includes("delayMinutes") || (editingId && form.trigger === "inactivity")) && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Inactivity Delay (minutes)</label>
                  <input
                    type="number" min={1} max={1440}
                    value={typeof form.config.delayMinutes === "number" ? form.config.delayMinutes : 10}
                    onChange={e => setConfig("delayMinutes", parseInt(e.target.value) || 10)}
                    className="w-32 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background" />
                </div>
              )}

              {/* Config fields — action-specific */}
              {(actionMeta.configFields.includes("message") || (editingId && form.action === "send_message")) && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Message Text *</label>
                  <textarea
                    value={typeof form.config.message === "string" ? form.config.message : ""}
                    onChange={e => setConfig("message", e.target.value)}
                    rows={3} placeholder="e.g. Bonjour! Comment pouvons-nous vous aider?"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background resize-none" />
                </div>
              )}

              {(actionMeta.configFields.includes("agentId") || (editingId && form.action === "assign_agent")) && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Assign to Agent</label>
                  {teamMembers.length > 0 ? (
                    <select
                      value={typeof form.config.agentId === "string" ? form.config.agentId : ""}
                      onChange={e => setConfig("agentId", e.target.value)}
                      className="w-full border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background">
                      <option value="">— Select agent —</option>
                      {teamMembers.map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name || m.email} ({m.role})</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={typeof form.config.agentId === "string" ? form.config.agentId : ""}
                      onChange={e => setConfig("agentId", e.target.value)}
                      placeholder="Agent ID (add team members first)"
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm outline-none bg-background" />
                  )}
                </div>
              )}

              {(actionMeta.configFields.includes("tag") || (editingId && form.action === "add_tag")) && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Tag</label>
                  <input
                    value={typeof form.config.tag === "string" ? form.config.tag : ""}
                    onChange={e => setConfig("tag", e.target.value)}
                    placeholder="e.g. vip, inquiry, urgent"
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 bg-background" />
                </div>
              )}

              {/* Active toggle */}
              <div className="flex items-center gap-3 pt-1">
                <input type="checkbox" id="ruleActive" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-primary" />
                <label htmlFor="ruleActive" className="text-sm font-medium">Active (rule fires immediately)</label>
              </div>
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
              <button onClick={handleSave} disabled={!form.name.trim() || createRule.isPending || updateRule.isPending}
                className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                {editingId ? "Save Changes" : "Create Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
