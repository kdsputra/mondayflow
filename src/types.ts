export type Status = "Done" | "Working on it" | "Stuck" | "Not started";
export type Priority = "Critical" | "High" | "Medium" | "Low";
export type View = "table" | "kanban" | "calendar" | "dashboard";
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer" | "guest";
export type BoardRole = "owner" | "editor" | "viewer";
export type BoardPrivacy = "main" | "private" | "shareable";

export type WorkItem = {
  id: string;
  board_id: string;
  title: string;
  group_name: string;
  owner: string;
  status: Status;
  priority: Priority;
  timeline_start: string;
  timeline_end: string;
  progress: number;
  budget: number;
  description: string;
  custom_values?: Record<string, string | number | boolean>;
  parent_id: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type ItemUpdate = {
  id: string;
  board_id: string;
  item_id: string;
  author: string;
  body: string;
  created_at: string;
};

export type ActivityEntry = {
  id: string;
  board_id: string;
  item_id: string | null;
  action: string;
  created_at: string;
};

export type Attachment = {
  id: string;
  board_id: string;
  item_id: string;
  file_name: string;
  storage_path: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

export type BoardSnapshot = {
  items: WorkItem[];
  updates: ItemUpdate[];
  activity: ActivityEntry[];
  attachments: Attachment[];
};

export type AppUser = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
};

export type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: "active" | "suspended";
  profile: AppUser;
};

export type Board = {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  privacy: BoardPrivacy;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type BoardMember = {
  board_id: string;
  user_id: string;
  role: BoardRole;
};

export type Team = {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
};

export type TeamMember = {
  team_id: string;
  user_id: string;
};

export type Invitation = {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
};

export type AccountState = {
  currentUser: AppUser;
  workspaces: Workspace[];
  members: WorkspaceMember[];
  boards: Board[];
  boardMembers: BoardMember[];
  teams: Team[];
  teamMembers: TeamMember[];
  invitations: Invitation[];
};

export const statuses: Status[] = ["Done", "Working on it", "Stuck", "Not started"];
export const priorities: Priority[] = ["Critical", "High", "Medium", "Low"];
export const owners = ["Nadia", "Raka", "Maya", "Dimas", "Sari", "Unassigned"];
export const groups = ["This week", "Next week", "Backlog"];
