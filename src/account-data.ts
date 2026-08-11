import type { AccountState } from "./types";

export const demoAccount: AccountState = {
  currentUser: {
    id: "demo-user-nadia",
    email: "nadia@mondayflow.demo",
    full_name: "Nadia Akbar",
    avatar_url: null,
  },
  workspaces: [
    { id: "demo-workspace-1", name: "Growth HQ", slug: "growth-hq", created_by: "demo-user-nadia", created_at: "2026-08-01T08:00:00Z" },
    { id: "demo-workspace-2", name: "Client Studio", slug: "client-studio", created_by: "demo-user-nadia", created_at: "2026-08-05T08:00:00Z" },
  ],
  members: [
    { workspace_id: "demo-workspace-1", user_id: "demo-user-nadia", role: "owner", status: "active", profile: { id: "demo-user-nadia", email: "nadia@mondayflow.demo", full_name: "Nadia Akbar", avatar_url: null } },
    { workspace_id: "demo-workspace-1", user_id: "demo-user-raka", role: "member", status: "active", profile: { id: "demo-user-raka", email: "raka@mondayflow.demo", full_name: "Raka Pratama", avatar_url: null } },
    { workspace_id: "demo-workspace-1", user_id: "demo-user-maya", role: "viewer", status: "active", profile: { id: "demo-user-maya", email: "maya@mondayflow.demo", full_name: "Maya Putri", avatar_url: null } },
    { workspace_id: "demo-workspace-2", user_id: "demo-user-nadia", role: "owner", status: "active", profile: { id: "demo-user-nadia", email: "nadia@mondayflow.demo", full_name: "Nadia Akbar", avatar_url: null } },
  ],
  boards: [
    { id: "demo-board-1", workspace_id: "demo-workspace-1", title: "Growth Campaign Board", description: "Plan launches, assign owners, track timelines, and keep execution visible.", privacy: "main", created_by: "demo-user-nadia", created_at: "2026-08-01T08:00:00Z", updated_at: "2026-08-11T08:00:00Z" },
    { id: "demo-board-2", workspace_id: "demo-workspace-1", title: "Product Sprint", description: "Coordinate the next product delivery cycle.", privacy: "private", created_by: "demo-user-nadia", created_at: "2026-08-02T08:00:00Z", updated_at: "2026-08-10T08:00:00Z" },
    { id: "demo-board-3", workspace_id: "demo-workspace-2", title: "Client Delivery", description: "Track client milestones and approvals.", privacy: "shareable", created_by: "demo-user-nadia", created_at: "2026-08-05T08:00:00Z", updated_at: "2026-08-09T08:00:00Z" },
  ],
  boardMembers: [
    { board_id: "demo-board-1", user_id: "demo-user-nadia", role: "owner" },
    { board_id: "demo-board-2", user_id: "demo-user-nadia", role: "owner" },
    { board_id: "demo-board-2", user_id: "demo-user-raka", role: "editor" },
    { board_id: "demo-board-3", user_id: "demo-user-nadia", role: "owner" },
  ],
  teams: [
    { id: "demo-team-1", workspace_id: "demo-workspace-1", name: "Growth", created_at: "2026-08-01T08:00:00Z" },
    { id: "demo-team-2", workspace_id: "demo-workspace-1", name: "Product", created_at: "2026-08-01T08:00:00Z" },
  ],
  teamMembers: [
    { team_id: "demo-team-1", user_id: "demo-user-nadia" },
    { team_id: "demo-team-1", user_id: "demo-user-raka" },
    { team_id: "demo-team-2", user_id: "demo-user-maya" },
  ],
  invitations: [],
};
