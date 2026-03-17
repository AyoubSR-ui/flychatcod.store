import { AppLayout } from "@/components/AppLayout";
import { UserPlus, Trash2, Crown, Shield, Headphones, RotateCw } from "lucide-react";
import { useState } from "react";
import { useGetTeamMembers, useInviteTeamMember, useRemoveTeamMember } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useI18n } from "@/hooks/use-i18n";

const ROLE_CONFIG = {
  owner: { label: "Owner", color: "bg-violet-100 text-violet-800 border-violet-200", icon: Crown },
  admin: { label: "Admin", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Shield },
  agent: { label: "Agent", color: "bg-teal-100 text-teal-800 border-teal-200", icon: Headphones },
};

const STATUS_CONFIG = {
  active: { label: "Active", color: "bg-green-100 text-green-800" },
  invited: { label: "Invited", color: "bg-yellow-100 text-yellow-800" },
  inactive: { label: "Inactive", color: "bg-gray-100 text-gray-600" },
};

export default function Team() {
  const { data, isLoading, refetch } = useGetTeamMembers();
  const inviteMember = useInviteTeamMember();
  const removeMember = useRemoveTeamMember();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ email: "", role: "agent" as "admin" | "agent" });
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const { t } = useI18n();

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
      const token = localStorage.getItem("flychat_token");
      const resp = await fetch(`/api/team/members/${id}/resend-invite`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (resp.ok) {
        if (data.inviteSent) {
          setInviteMessage({ type: "success", text: t("team.resend_success") });
        } else {
          setInviteMessage({ type: "warning", text: t("team.resend_no_email") });
        }
      } else {
        setInviteMessage({ type: "error", text: data.message || t("team.resend_failed") });
      }
    } catch {
      setInviteMessage({ type: "error", text: t("team.network_error") });
    } finally {
      setResendingId(null);
      setTimeout(() => setInviteMessage(null), 5000);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this team member?")) return;
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
              <p className="text-muted-foreground mt-1">Manage your support and sales team members.</p>
            </div>
            <button onClick={() => setShowModal(true)} className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 shadow-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Invite Member
            </button>
          </div>

          {inviteMessage && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
              inviteMessage.type === "success" ? "bg-green-50 text-green-800 border border-green-200" :
              inviteMessage.type === "warning" ? "bg-yellow-50 text-yellow-800 border border-yellow-200" :
              "bg-red-50 text-red-800 border border-red-200"
            }`}>
              {inviteMessage.text}
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <p className="text-sm text-muted-foreground">{data?.members.length || 0} team member{(data?.members.length || 0) !== 1 ? "s" : ""}</p>
            </div>
            <div className="divide-y divide-border/50">
              {isLoading ? (
                <p className="px-6 py-10 text-center text-muted-foreground">{t("common.loading")}</p>
              ) : data?.members.length === 0 ? (
                <p className="px-6 py-10 text-center text-muted-foreground">No team members yet. Invite your first agent to get started.</p>
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
                          <RoleIcon className="w-3 h-3" /> {roleConfig.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusConfig.color}`}>{statusConfig.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{member.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground hidden sm:block">{format(new Date(member.createdAt), 'MMM dd, yyyy')}</p>
                    <div className="flex items-center gap-1">
                      {member.status === "invited" && (
                        <button onClick={() => handleResendInvite(member.id)} disabled={resendingId === member.id}
                          className="p-2 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-muted-foreground transition-colors disabled:opacity-50"
                          title="Resend invitation">
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
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold">Invite Team Member</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-secondary rounded-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Email Address *</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="colleague@example.com"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Role</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value as "agent" | "admin"})} className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background">
                  <option value="agent">Agent — Can manage conversations and orders</option>
                  <option value="admin">Admin — Can manage everything except billing</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-secondary">{t("common.cancel")}</button>
              <button onClick={handleInvite} disabled={!form.email || inviting} className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
                {inviting ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
