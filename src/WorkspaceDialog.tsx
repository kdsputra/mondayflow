import { useMemo, useState } from "react";
import { Check, Copy, Lock, Mail, Plus, ShieldCheck, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { createInvitation, createTeam, removeMember, setBoardMember, setMemberRole, setTeamMember } from "./database";
import type { AccountState, BoardRole, WorkspaceRole } from "./types";

type Tab = "members" | "board" | "teams" | "invitations";

export default function WorkspaceDialog({ account, workspaceId, boardId, onChange, onClose, onNotify }: {
  account: AccountState;
  workspaceId: string;
  boardId: string;
  onChange: (account: AccountState) => void;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("members");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("member");
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const workspace = account.workspaces.find((entry) => entry.id === workspaceId)!;
  const board = account.boards.find((entry) => entry.id === boardId)!;
  const members = account.members.filter((entry) => entry.workspace_id === workspaceId);
  const teams = account.teams.filter((entry) => entry.workspace_id === workspaceId);
  const invitations = account.invitations.filter((entry) => entry.workspace_id === workspaceId && entry.status === "pending");
  const currentMembership = members.find((entry) => entry.user_id === account.currentUser.id);
  const canManage = currentMembership?.role === "owner" || currentMembership?.role === "admin";
  const currentBoardMembership = account.boardMembers.find((entry) => entry.board_id === boardId && entry.user_id === account.currentUser.id);
  const canManageBoard = canManage || board.created_by === account.currentUser.id || currentBoardMembership?.role === "owner";
  const memberRoles: WorkspaceRole[] = ["owner", "admin", "member", "viewer", "guest"];
  const invitationRoles: WorkspaceRole[] = ["admin", "member", "viewer", "guest"];

  const teamCounts = useMemo(() => Object.fromEntries(teams.map((team) => [team.id, account.teamMembers.filter((entry) => entry.team_id === team.id).length])), [account.teamMembers, teams]);

  async function invite() {
    if (!email.includes("@")) return;
    setBusy(true);
    setError("");
    try {
      const invitation = await createInvitation(workspaceId, email, inviteRole);
      onChange({ ...account, invitations: [invitation, ...account.invitations.filter((entry) => !(entry.workspace_id === workspaceId && entry.email.toLowerCase() === email.toLowerCase() && entry.status === "pending"))] });
      setEmail("");
      setTab("invitations");
      onNotify("Invitation link created.");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, role: WorkspaceRole) {
    setError("");
    try {
      await setMemberRole(workspaceId, userId, role);
      onChange({ ...account, members: account.members.map((entry) => entry.workspace_id === workspaceId && entry.user_id === userId ? { ...entry, role } : entry) });
      onNotify("Member role updated.");
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function remove(userId: string) {
    setError("");
    try {
      await removeMember(workspaceId, userId);
      onChange({ ...account, members: account.members.filter((entry) => !(entry.workspace_id === workspaceId && entry.user_id === userId)), teamMembers: account.teamMembers.filter((entry) => entry.user_id !== userId) });
      onNotify("Member removed from workspace.");
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function addTeam() {
    if (teamName.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const team = await createTeam(workspaceId, teamName.trim());
      onChange({ ...account, teams: [...account.teams, team] });
      setTeamName("");
      onNotify("Team created.");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTeamMember(teamId: string, userId: string, active: boolean) {
    setError("");
    try {
      await setTeamMember(teamId, userId, active);
      onChange({
        ...account,
        teamMembers: active
          ? [...account.teamMembers.filter((entry) => !(entry.team_id === teamId && entry.user_id === userId)), { team_id: teamId, user_id: userId }]
          : account.teamMembers.filter((entry) => !(entry.team_id === teamId && entry.user_id === userId)),
      });
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  async function changeBoardAccess(userId: string, role: BoardRole | null) {
    setError("");
    try {
      await setBoardMember(boardId, userId, role);
      onChange({
        ...account,
        boardMembers: role
          ? [...account.boardMembers.filter((entry) => !(entry.board_id === boardId && entry.user_id === userId)), { board_id: boardId, user_id: userId, role }]
          : account.boardMembers.filter((entry) => !(entry.board_id === boardId && entry.user_id === userId)),
      });
      onNotify(role ? "Board access updated." : "Board access removed.");
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function invitationLink(token: string) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("invite", token);
    return url.toString();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="workspace-modal" role="dialog" aria-modal="true" aria-label="Manage workspace">
        <div className="workspace-modal-header">
          <div><span className="workspace-icon"><UsersRound size={19} /></span><div><strong>{workspace.name}</strong><small>Workspace administration</small></div></div>
          <button className="icon-button" onClick={onClose} aria-label="Close workspace manager"><X size={18} /></button>
        </div>
        <div className="workspace-tabs">
          <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>Members <span>{members.length}</span></button>
          <button className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}>Board access <span>{account.boardMembers.filter((entry) => entry.board_id === boardId).length}</span></button>
          <button className={tab === "teams" ? "active" : ""} onClick={() => setTab("teams")}>Teams <span>{teams.length}</span></button>
          <button className={tab === "invitations" ? "active" : ""} onClick={() => setTab("invitations")}>Invitations <span>{invitations.length}</span></button>
        </div>
        <div className="workspace-modal-body">
          {error ? <div className="workspace-error">{error}</div> : null}
          {tab === "members" ? <>
            {canManage ? <div className="invite-composer"><div><Mail size={16} /><input type="email" placeholder="teammate@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as WorkspaceRole)}>{invitationRoles.map((role) => <option key={role}>{role}</option>)}</select><button className="primary-button" disabled={busy || !email.includes("@")} onClick={() => void invite()}><UserPlus size={16} /> Invite</button></div> : null}
            <div className="workspace-list member-admin-list">{members.map((member) => <div key={member.user_id}>
              <div className="member-avatar">{initials(member.profile.full_name)}</div>
              <div className="member-copy"><strong>{member.profile.full_name}</strong><span>{member.profile.email}</span></div>
              <select disabled={!canManage || member.role === "owner"} value={member.role} onChange={(event) => void changeRole(member.user_id, event.target.value as WorkspaceRole)}>{memberRoles.map((role) => <option key={role}>{role}</option>)}</select>
              <button className="icon-button small" disabled={!canManage || member.role === "owner"} onClick={() => void remove(member.user_id)} aria-label={`Remove ${member.profile.full_name}`}><Trash2 size={15} /></button>
            </div>)}</div>
          </> : null}
          {tab === "board" ? <div className="board-access-panel"><div className="board-access-summary"><span className={board.privacy}><Lock size={16} /></span><div><strong>{board.title}</strong><small>{board.privacy} board · explicit members can be editors or viewers</small></div></div><div className="workspace-list board-access-list">{members.filter((member) => member.role !== "guest" || board.privacy === "shareable").map((member) => { const access = account.boardMembers.find((entry) => entry.board_id === boardId && entry.user_id === member.user_id); const isOwner = access?.role === "owner"; return <div key={member.user_id}><div className="member-avatar">{initials(member.profile.full_name)}</div><div className="member-copy"><strong>{member.profile.full_name}</strong><span>{member.profile.email}</span></div><label className="access-toggle"><input type="checkbox" checked={Boolean(access)} disabled={!canManageBoard || isOwner} onChange={(event) => void changeBoardAccess(member.user_id, event.target.checked ? "viewer" : null)} /><span>Access</span></label>{access ? <select value={access.role} disabled={!canManageBoard || isOwner} onChange={(event) => void changeBoardAccess(member.user_id, event.target.value as BoardRole)}><option value="owner">owner</option><option value="editor">editor</option><option value="viewer">viewer</option></select> : null}</div>; })}</div></div> : null}
          {tab === "teams" ? <>
            {canManage ? <div className="team-composer"><input placeholder="New team name" value={teamName} onChange={(event) => setTeamName(event.target.value)} /><button className="primary-button" disabled={busy || teamName.trim().length < 2} onClick={() => void addTeam()}><Plus size={16} /> Create team</button></div> : null}
            <div className="team-grid">{teams.map((team) => <section key={team.id}><div className="team-heading"><span><UsersRound size={17} /></span><div><strong>{team.name}</strong><small>{teamCounts[team.id] ?? 0} members</small></div></div><div className="team-member-options">{members.filter((member) => member.role !== "guest").map((member) => { const checked = account.teamMembers.some((entry) => entry.team_id === team.id && entry.user_id === member.user_id); return <label key={member.user_id}><input type="checkbox" checked={checked} disabled={!canManage} onChange={(event) => void toggleTeamMember(team.id, member.user_id, event.target.checked)} /><span>{member.profile.full_name}</span>{checked ? <Check size={14} /> : null}</label>; })}</div></section>)}</div>
          </> : null}
          {tab === "invitations" ? <div className="workspace-list invitation-list">{invitations.length ? invitations.map((invitation) => <div key={invitation.id}><span className="invite-status"><ShieldCheck size={17} /></span><div className="member-copy"><strong>{invitation.email}</strong><span>{invitation.role} · expires {new Date(invitation.expires_at).toLocaleDateString()}</span></div><button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(invitationLink(invitation.token)); onNotify("Invitation link copied."); }}><Copy size={15} /> Copy link</button></div>) : <div className="workspace-empty"><Mail size={22} /><strong>No pending invitations</strong><span>New invitations will appear here.</span></div>}</div> : null}
        </div>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
