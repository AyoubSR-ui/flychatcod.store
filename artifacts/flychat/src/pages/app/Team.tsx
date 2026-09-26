import { AppLayout } from "@/components/AppLayout";
import { UserPlus, Trash2, Crown, Shield, Headphones, RotateCw, Zap, Play } from "lucide-react";
import { useState } from "react";
import {
  useGetSubscription, useGetTeamMembers, useInviteTeamMember, useRemoveTeamMember,
  useGetAutoDispatch, useUpdateAutoDispatch, useUpdateDispatchSettings, useRunAutoDispatch,
  type DispatchNowResponse,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";
import { Switch } from "@/components/ui/switch";
import { authFetch } from "@/lib/auth-fetch";

const ROLE_CONFIG = {
  owner: { labelKey: "team.role.owner", color: "bg-violet-100 text-violet-800 border-violet-200", icon: Crown },
  admin: { labelKey: "team.role.admin", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Shield },
  agent: { labelKey: "team.role.agent", color: "bg-teal-100 text-teal-800 border-teal-200", icon: Headphones },
};

const STATUS_CONFIG = {
  active: { labelKey: "team.status.active", color: "bg-green-100 text-green-800" },
  invited: { labelKey: "team.status.invited", color: "bg-yellow-100 text-yellow-800" },
  inactive: { labelKey: "team.status.inactive", color: "bg-gray-100 text-gray-600" },
};

export default function Team() {
  const [tab, setTab] = useState<"members" | "dispatch">("members");
  const { data, isLoading, isError, refetch } = useGetTeamMembers();
  const inviteMember = useInviteTeamMember();
  const removeMember = useRemoveTeamMember();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ email: "", role: "agent" as "admin" | "agent" });
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const { t } = useI18n();
  const { data: subData } = useGetSubscription();
  const PLAN_LIMITS: Record<string, number> = { free: 1, starter: 3, pro: 10, agency: -1 };
  const plan = subData?.plan ?? "free";
  const memberLimit = PLAN_LIMITS[plan] ?? 1;
  const memberCount = data?.members.length ?? 0;
  const atLimit = memberLimit !== -1 && memberCount >= memberLimit;

  const handleInvite = async () => {
    setInviting(true);
    setInviteMessage(null);
    try {
      const result = await inviteMember.mutateAsync({ data: form });
      const inviteSent = result.inviteSent;
      if (inviteSent) {
        setInviteMessage({ type: "success", text: t("team.invite_sent") });
      } else {
        setInviteMessage({ type: "warning", text: t("team.invite_created_no_email") });
      }
      setShowModal(false);
      setForm({ email: "", role: "agent" });
      refetch();
    } catch {
      setInviteMessage({ type: "error", text: t("team.invite_failed") });
    }
    setInviting(false);
    setTimeout(() => setInviteMessage(null), 5000);
  };

  const handleResendInvite = async (id: string) => {
    setResendingId(id);
    setInviteMessage(null);
    try {
      const data = await authFetch<{ inviteSent: boolean }>(`/api/team/members/${id}/resend-invite`, { method: "POST" });
      if (data.inviteSent) {
        setInviteMessage({ type: "success", text: t("team.resend_success") });
      } else {
        setInviteMessage({ type: "warning", text: t("team.resend_no_email") });
      }
    } catch (err: any) {
      setInviteMessage({ type: "error", text: err.message || t("team.network_error") });
    } finally {
      setResendingId(null);
      setTimeout(() => setInviteMessage(null), 5000);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm(t("team.remove_confirm"))) return;
    await removeMember.mutateAsync({ id });
    refetch();
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">{t("nav.team")}</h1>
              <p className="text-muted-foreground mt-1">{t("team.manage_desc")}</p>
            </div>
            <div className="flex items-center gap-3">
  {memberLimit !== -1 && (
    <span className="text-sm text-muted-foreground">
      <span className={`font-bold ${atLimit ? "text-red-600" : "text-foreground"}`}>{memberCount}</span>
      {t("team.members_slash_limit").replace("{limit}", String(memberLimit))}
    </span>
  )}
  <button
    onClick={() => atLimit ? null : setShowModal(true)}
     disabled={atLimit}
      title={atLimit ? t("team.upgrade_tooltip").replace("{limit}", String(memberLimit)) : undefined}
       className={`px-5 py-2.5 rounded-xl font-bold shadow-sm flex items-center gap-2 transition-all ${
        atLimit
        ? "bg-secondary text-muted-foreground cursor-not-allowed opacity-60"
        : "bg-primary text-white hover:bg-primary/90"
            }`}>
    <UserPlus className="w-4 h-4" /> {t("team.invite_member")}
     </button>
       </div>
       </div>

          <div className="flex gap-1 bg-secondary/60 p-1 rounded-xl w-fit">
            <button onClick={() => setTab("members")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "members" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t("team.tab.members")}
            </button>
            <button onClick={() => setTab("dispatch")} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5 ${tab === "dispatch" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Zap className="w-3.5 h-3.5" /> {t("team.tab.dispatch")}
            </button>
          </div>

          {tab === "members" && inviteMessage && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
              inviteMessage.type === "success" ? "bg-green-50 text-green-800 border border-green-200" :
              inviteMessage.type === "warning" ? "bg-yellow-50 text-yellow-800 border border-yellow-200" :
              "bg-red-50 text-red-800 border border-red-200"
            }`}>
              {inviteMessage.text}
            </div>
          )}
          {tab === "members" && atLimit && (
  <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
    <div>
      <p className="text-sm font-bold text-amber-800">{t("team.limit_reached_title")}</p>
      <p className="text-xs text-amber-700 mt-0.5">
        {t("team.limit_reached_desc_pre")}<span className="font-bold capitalize">{plan}</span>{t("team.limit_reached_desc_post").replace("{limit}", String(memberLimit))}
      </p>
    </div>
    <a href="/billing" className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-colors whitespace-nowrap">
      {t("team.upgrade_plan_btn")}
    </a>
      </div>
        )}

          {tab === "dispatch" && <DispatchTab />}

          {tab === "members" && (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <p className="text-sm text-muted-foreground">{t("team.members_count").replace("{count}", String(data?.members.length || 0))}</p>
            </div>
            <div className="divide-y divide-border/50">
              {isLoading ? (
                <p className="px-6 py-10 text-center text-muted-foreground">{t("common.loading")}</p>
              ) : isError ? (
                <div className="px-6 py-10 text-center space-y-2">
                  <p className="text-red-700">{t("common.load_failed")}</p>
                  <button onClick={() => refetch()} className="text-sm font-bold text-primary hover:underline">{t("common.retry")}</button>
                </div>
              ) : data?.members.length === 0 ? (
                <p className="px-6 py-10 text-center text-muted-foreground">{t("team.no_members")}</p>
              ) : data?.members.map((member) => {
                const roleConfig = ROLE_CONFIG[member.role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.agent;
                const statusConfig = STATUS_CONFIG[member.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.inactive;
                const RoleIcon = roleConfig.icon;
                return (
                  <div key={member.id} className="px-6 py-5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                      {(member.name || member.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{member.name || "—"}</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${roleConfig.color}`}>
                          <RoleIcon className="w-3 h-3" /> {t(roleConfig.labelKey)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusConfig.color}`}>{t(statusConfig.labelKey)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{member.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground hidden sm:block">{format(new Date(member.createdAt), 'MMM dd, yyyy')}</p>
                    <div className="flex items-center gap-1">
                      {member.status === "invited" && (
                        <button onClick={() => handleResendInvite(member.id)} disabled={resendingId === member.id}
                          className="p-2 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-muted-foreground transition-colors disabled:opacity-50"
                          title={t("team.resend_invitation_title")}>
                          <RotateCw className={`w-4 h-4 ${resendingId === member.id ? "animate-spin" : ""}`} />
                        </button>
                      )}
                      {member.role !== "owner" && (
                        <button onClick={() => handleRemove(member.id)} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg text-muted-foreground transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold">{t("team.modal.title")}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-secondary rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("team.modal.email_label")}</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="colleague@example.com"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">{t("team.modal.role_label")}</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value as "agent" | "admin"})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                  <option value="agent">{t("team.modal.role_agent")}</option>
                  <option value="admin">{t("team.modal.role_admin")}</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
              <button onClick={handleInvite} disabled={!form.email || inviting} className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                {inviting ? t("team.sending") : t("team.invite_member")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// ─── Order Dispatch tab ─────────────────────────────────────────────────────────
function DispatchTab() {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useGetAutoDispatch();
  const updateConfig = useUpdateAutoDispatch();
  const updateAgent = useUpdateDispatchSettings();
  const runDispatch = useRunAutoDispatch();
  const [ruleDraft, setRuleDraft] = useState<"none" | "transfer" | "redistribute" | null>(null);
  const [transferDraft, setTransferDraft] = useState<string[] | null>(null);
  const [runResult, setRunResult] = useState<DispatchNowResponse | null>(null);
  const [running, setRunning] = useState(false);

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">{t("common.loading")}</div>;
  if (isError || !data) return (
    <div className="text-center py-10 space-y-2">
      <p className="text-red-700">{t("common.load_failed")}</p>
      <button onClick={() => refetch()} className="text-sm font-bold text-primary hover:underline">{t("common.retry")}</button>
    </div>
  );

  const enabled = data.enabled;
  const rule = ruleDraft ?? data.inactiveAgentRule;
  const transferTargets = transferDraft ?? data.transferToAgentIds;

  const toggleEnabled = () => updateConfig.mutate({ data: { enabled: !enabled } });

  const saveRule = (nextRule: "none" | "transfer" | "redistribute") => {
    setRuleDraft(nextRule);
    updateConfig.mutate({ data: { inactiveAgentRule: nextRule } });
  };

  const toggleTransferTarget = (agentId: string) => {
    const next = transferTargets.includes(agentId) ? transferTargets.filter(id => id !== agentId) : [...transferTargets, agentId];
    setTransferDraft(next);
    updateConfig.mutate({ data: { transferToAgentIds: next } });
  };

  const handleQuotaChange = (agentId: string, quota: number) => {
    if (!Number.isFinite(quota) || quota < 0) return;
    updateAgent.mutate({ id: agentId, data: { quota } }, { onSuccess: () => refetch() });
  };

  const handleActiveToggle = (agentId: string, active: boolean) => {
    updateAgent.mutate({ id: agentId, data: { active } }, { onSuccess: () => refetch() });
  };

  const handleDispatchNow = async () => {
    // The owner sees the exact count before committing — not just a bare
    // "Dispatch Now" button. data.unassignedEligibleCount already excludes
    // anything not "new" or "confirmed" (cancelled, suspicious, shipped,
    // callback, etc. are never touched by this).
    if (data.unassignedEligibleCount === 0) {
      setRunResult({ assignedCount: 0, byAgent: [] });
      return;
    }
    if (!confirm(t("team.dispatch.confirm_run").replace("{n}", String(data.unassignedEligibleCount)))) return;
    setRunning(true);
    setRunResult(null);
    try {
      const result = await runDispatch.mutateAsync();
      setRunResult(result);
      refetch();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Store-level toggle */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-foreground">{t("team.dispatch.auto_title")}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{t("team.dispatch.auto_desc")}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggleEnabled} className="shrink-0" />
      </div>

      {/* Per-agent quota / share / toggle */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-bold text-foreground">{t("team.dispatch.agents_title")}</h3>
        </div>
        {data.agents.length === 0 ? (
          <p className="px-5 py-8 text-center text-muted-foreground text-sm">{t("team.dispatch.no_agents")}</p>
        ) : (
          <div className="divide-y divide-border/50">
            {data.agents.map(agent => (
              <div key={agent.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{agent.name || agent.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <label className="text-xs text-muted-foreground uppercase font-bold tracking-wide">{t("team.dispatch.quota_label")}</label>
                  <input
                    type="number" min={0} defaultValue={agent.quota}
                    onBlur={e => handleQuotaChange(agent.id, Number(e.target.value))}
                    className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-center outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <span className="shrink-0 w-14 text-right text-sm font-bold text-foreground">{agent.sharePercent}%</span>
                <Switch
                  checked={agent.active}
                  onCheckedChange={(checked) => handleActiveToggle(agent.id, checked)}
                  title={agent.active ? t("team.dispatch.active_title") : t("team.dispatch.off_title")}
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dispatch Now */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-foreground">{t("team.dispatch.now_title")}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{t("team.dispatch.now_desc")}</p>
            <p className="text-xs font-bold text-foreground mt-1.5">
              {t("team.dispatch.eligible_count").replace("{n}", String(data.unassignedEligibleCount))}
            </p>
          </div>
          <button
            onClick={handleDispatchNow}
            disabled={running || data.unassignedEligibleCount === 0 || data.agents.every(a => !a.active || a.quota === 0)}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Play className="w-4 h-4" /> {running ? t("team.dispatch.running") : t("team.dispatch.now_btn")}
          </button>
        </div>
        {runResult && (
          <div className="p-3 bg-secondary/50 rounded-xl text-sm space-y-1">
            {runResult.assignedCount === 0 ? (
              <p className="text-muted-foreground">{t("team.dispatch.nothing_to_assign")}</p>
            ) : (
              <>
                <p className="font-medium text-foreground">{t("team.dispatch.assigned_summary").replace("{n}", String(runResult.assignedCount))}</p>
                <ul className="text-muted-foreground space-y-0.5">
                  {runResult.byAgent.map(a => (
                    <li key={a.agentId}>{a.name || a.email}: {t("team.dispatch.assigned_count").replace("{n}", String(a.count))}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* Inactive-agent rule */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="font-bold text-foreground">{t("team.dispatch.inactive_rule_title")}</h3>
        <p className="text-sm text-muted-foreground">{t("team.dispatch.inactive_rule_desc")}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          {(["none", "transfer", "redistribute"] as const).map(opt => (
            <button
              key={opt}
              onClick={() => saveRule(opt)}
              className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-bold border transition-colors ${rule === opt ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
            >
              {t(`team.dispatch.rule.${opt}`)}
            </button>
          ))}
        </div>
        {rule === "transfer" && (
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t("team.dispatch.transfer_targets_label")}</p>
            <div className="flex flex-wrap gap-2">
              {data.agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => toggleTransferTarget(agent.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${transferTargets.includes(agent.id) ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-secondary"}`}
                >
                  {agent.name || agent.email}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
