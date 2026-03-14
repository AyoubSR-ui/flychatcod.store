import { AppLayout } from "@/components/AppLayout";
import { Plus, Zap, ToggleRight, ToggleLeft, Trash2, Bot, Info } from "lucide-react";
import { useState } from "react";
import { useGetAutomationRules, useCreateAutomationRule, useUpdateAutomationRule, useDeleteAutomationRule } from "@workspace/api-client-react";
import { useI18n } from "@/hooks/use-i18n";

const TRIGGERS = ["new_conversation","keyword","order_created","inactivity"] as const;
const ACTIONS = ["send_message","assign_agent","create_order_flow","escalate"] as const;

const TRIGGER_LABELS: Record<string, string> = { new_conversation: "New Conversation", keyword: "Keyword Match", order_created: "Order Created", inactivity: "Visitor Inactivity" };
const ACTION_LABELS: Record<string, string> = { send_message: "Send Message", assign_agent: "Assign to Agent", create_order_flow: "Start Order Flow", escalate: "Escalate to Human" };

export default function Automation() {
  const { data, isLoading, refetch } = useGetAutomationRules();
  const createRule = useCreateAutomationRule();
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", trigger: "new_conversation" as any, action: "send_message" as any, isActive: true });
  const { t } = useI18n();

  const handleCreate = async () => {
    await createRule.mutateAsync({ data: form });
    setShowModal(false); setForm({ name: "", trigger: "new_conversation", action: "send_message", isActive: true }); refetch();
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

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.automation")}</h1>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-200">MVP</span>
              </div>
              <p className="text-muted-foreground mt-1">Rule-based automations to handle common chat flows.</p>
            </div>
            <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Rule
            </button>
          </div>

          {/* AI coming soon banner */}
          <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="font-bold text-violet-900">AI Automation — Coming Soon</p>
              <p className="text-sm text-violet-700 mt-1">Intent detection, order entity extraction, confidence scoring, and AI-powered confirmation calls are on the roadmap. Current rules are structured and rule-based to prepare the architecture.</p>
            </div>
          </div>

          {/* Rules */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center py-10 text-muted-foreground">{t("common.loading")}</div>
            ) : data?.rules.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-10 text-center">
                <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="font-semibold text-foreground">No automation rules yet</p>
                <p className="text-sm text-muted-foreground mt-1">Create your first rule to automate welcome messages and order flows.</p>
              </div>
            ) : data?.rules.map((rule) => (
              <div key={rule.id} className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{rule.name}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">When: <span className="font-medium text-foreground">{TRIGGER_LABELS[rule.trigger] || rule.trigger}</span></span>
                    <span className="text-xs text-muted-foreground">Then: <span className="font-medium text-foreground">{ACTION_LABELS[rule.action] || rule.action}</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${rule.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                    {rule.isActive ? "Active" : "Inactive"}
                  </span>
                  <button onClick={() => handleToggle(rule)} className="p-2 hover:bg-secondary rounded-lg">
                    {rule.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => handleDelete(rule.id)} className="p-2 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Canned Replies placeholder */}
          <div className="bg-card border border-dashed border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <Info className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-bold text-foreground">Canned Replies</h3>
              <span className="px-2 py-0.5 bg-secondary text-muted-foreground text-xs rounded-full">Coming Soon</span>
            </div>
            <p className="text-sm text-muted-foreground">Save frequently used responses to quickly reply to common customer questions. This section will appear here once enabled.</p>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold">New Automation Rule</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-secondary rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Rule Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Welcome new visitors"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Trigger</label>
                <select value={form.trigger} onChange={e => setForm({...form, trigger: e.target.value as any})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                  {TRIGGERS.map(t => <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Action</label>
                <select value={form.action} onChange={e => setForm({...form, action: e.target.value as any})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                  {ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="ruleActive" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} className="w-4 h-4 accent-primary" />
                <label htmlFor="ruleActive" className="text-sm font-medium">Activate immediately</label>
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
              <button onClick={handleCreate} disabled={!form.name} className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">Create Rule</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
