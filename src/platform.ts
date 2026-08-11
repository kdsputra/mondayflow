import type { AccountState, BoardSnapshot, Priority, Status, View, WorkItem } from "./types";

export type ColumnType = "text" | "number" | "date" | "dropdown" | "checkbox" | "formula" | "people" | "dependency";
export type AutomationTrigger = "item_created" | "status_changed" | "date_arrived" | "webhook_received";
export type AutomationAction = "set_status" | "assign_owner" | "notify" | "send_email" | "call_webhook";
export type IntegrationProvider = "google-calendar" | "outlook-calendar" | "slack" | "teams" | "google-drive" | "github" | "jira" | "hubspot";

export type CustomColumn = {
  id: string;
  board_id: string;
  title: string;
  type: ColumnType;
  options: string[];
  formula: string;
};

export type SavedBoardView = {
  id: string;
  board_id: string;
  name: string;
  view: View;
  status: Status | "All";
  priority: Priority | "All";
  owner: string;
};

export type BoardTemplate = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  columns: Array<Pick<CustomColumn, "title" | "type" | "options" | "formula">>;
};

export type AutomationRecipe = {
  id: string;
  board_id: string;
  name: string;
  trigger: AutomationTrigger;
  trigger_value: string;
  action: AutomationAction;
  action_value: string;
  enabled: boolean;
  last_run_at: string | null;
};

export type AutomationRun = {
  id: string;
  automation_id: string;
  board_id: string;
  item_id: string | null;
  status: "success" | "queued" | "failed";
  message: string;
  payload?: Record<string, unknown>;
  created_at: string;
};

export type IntegrationConnection = {
  id: string;
  workspace_id: string;
  provider: IntegrationProvider;
  status: "not_configured" | "ready" | "connected";
  label: string;
  endpoint: string;
  updated_at: string;
};

export type WorkDoc = { id: string; workspace_id: string; board_id: string | null; title: string; content: string; updated_at: string };
export type FormField = { id: string; label: string; type: "text" | "email" | "long_text" | "date" | "dropdown"; required: boolean; options: string[] };
export type WorkForm = { id: string; board_id: string; title: string; description: string; published: boolean; fields: FormField[] };
export type FormSubmission = { id: string; form_id: string; values: Record<string, string>; created_at: string };
export type CanvasNode = { id: string; board_id: string; text: string; color: "blue" | "green" | "yellow" | "pink"; x: number; y: number };
export type CanvasEdge = { id: string; board_id: string; from: string; to: string };
export type InboxEntry = { id: string; workspace_id: string; title: string; body: string; read: boolean; created_at: string };

export type EnterpriseSettings = {
  sso_provider: "disabled" | "saml" | "oidc";
  sso_domain: string;
  sso_enforced: boolean;
  scim_enabled: boolean;
  scim_token_preview: string;
  retention_days: number;
  audit_export_enabled: boolean;
  plan: "free" | "standard" | "pro" | "enterprise";
  billing_status: "trial" | "active" | "past_due" | "not_configured";
};

export type ReliabilitySettings = {
  telemetry_enabled: boolean;
  automatic_backups: boolean;
  backup_interval: "daily" | "weekly";
  last_backup_at: string | null;
  offline_queue_enabled: boolean;
};

export type PlatformState = {
  version: 1;
  customColumns: CustomColumn[];
  customValues: Record<string, Record<string, string | number | boolean>>;
  savedViews: SavedBoardView[];
  templates: BoardTemplate[];
  automations: AutomationRecipe[];
  automationRuns: AutomationRun[];
  integrations: IntegrationConnection[];
  docs: WorkDoc[];
  forms: WorkForm[];
  submissions: FormSubmission[];
  canvasNodes: CanvasNode[];
  canvasEdges: CanvasEdge[];
  inbox: InboxEntry[];
  enterprise: EnterpriseSettings;
  reliability: ReliabilitySettings;
};

export type AutomationResult = {
  patch: Partial<WorkItem>;
  runs: AutomationRun[];
  notices: string[];
};

export const integrationCatalog: Array<{ provider: IntegrationProvider; name: string; description: string }> = [
  { provider: "google-calendar", name: "Google Calendar", description: "Sync item dates with shared calendars." },
  { provider: "outlook-calendar", name: "Outlook Calendar", description: "Create and update Microsoft calendar events." },
  { provider: "slack", name: "Slack", description: "Send channel notifications and action messages." },
  { provider: "teams", name: "Microsoft Teams", description: "Post delivery updates to Teams channels." },
  { provider: "google-drive", name: "Google Drive", description: "Attach Drive files without copying public URLs." },
  { provider: "github", name: "GitHub", description: "Link issues, pull requests, and deployment events." },
  { provider: "jira", name: "Jira", description: "Synchronize issues, status, and assignees." },
  { provider: "hubspot", name: "HubSpot", description: "Connect deals and customer delivery workflows." },
];

export function createDefaultPlatformState(workspaceId: string, boardId: string): PlatformState {
  const now = new Date().toISOString();
  return {
    version: 1,
    customColumns: [
      { id: "demo-col-risk", board_id: boardId, title: "Risk score", type: "formula", options: [], formula: "budget / max(progress, 1)" },
      { id: "demo-col-channel", board_id: boardId, title: "Channel", type: "dropdown", options: ["Web", "Email", "Social", "Partner"], formula: "" },
    ],
    customValues: {},
    savedViews: [{ id: "demo-view-focus", board_id: boardId, name: "High priority focus", view: "table", status: "All", priority: "High", owner: "All" }],
    templates: [
      { id: "template-launch", workspace_id: workspaceId, name: "Campaign launch", description: "Launch checklist with channel and approval fields.", columns: [{ title: "Channel", type: "dropdown", options: ["Web", "Email", "Social"], formula: "" }, { title: "Approved", type: "checkbox", options: [], formula: "" }] },
      { id: "template-sprint", workspace_id: workspaceId, name: "Product sprint", description: "Sprint planning with dependencies and effort.", columns: [{ title: "Depends on", type: "dependency", options: [], formula: "" }, { title: "Effort", type: "number", options: [], formula: "" }] },
    ],
    automations: [{ id: "11111111-1111-4111-8111-111111111111", board_id: boardId, name: "Alert when work is stuck", trigger: "status_changed", trigger_value: "Stuck", action: "notify", action_value: "Owner and board admins", enabled: true, last_run_at: null }],
    automationRuns: [],
    integrations: integrationCatalog.map((entry) => ({ id: `integration-${entry.provider}`, workspace_id: workspaceId, provider: entry.provider, status: "not_configured", label: entry.name, endpoint: "", updated_at: now })),
    docs: [{ id: "doc-kickoff", workspace_id: workspaceId, board_id: boardId, title: "Campaign kickoff", content: "# Campaign kickoff\n\nGoals, decisions, meeting notes, and open questions live here.", updated_at: now }],
    forms: [{ id: "22222222-2222-4222-8222-222222222222", board_id: boardId, title: "New work request", description: "Submit a request to this board.", published: true, fields: [{ id: "field-requester", label: "Requester email", type: "email", required: true, options: [] }, { id: "field-brief", label: "Request brief", type: "long_text", required: true, options: [] }] }],
    submissions: [],
    canvasNodes: [{ id: "canvas-goal", board_id: boardId, text: "Launch goal", color: "blue", x: 8, y: 12 }, { id: "canvas-audience", board_id: boardId, text: "Audience", color: "green", x: 42, y: 32 }, { id: "canvas-channels", board_id: boardId, text: "Channels", color: "yellow", x: 70, y: 12 }],
    canvasEdges: [{ id: "edge-1", board_id: boardId, from: "canvas-goal", to: "canvas-audience" }, { id: "edge-2", board_id: boardId, from: "canvas-audience", to: "canvas-channels" }],
    inbox: [{ id: "inbox-welcome", workspace_id: workspaceId, title: "Workspace controls are ready", body: "Saved views, automations, integrations, and enterprise controls are available from Platform center.", read: false, created_at: now }],
    enterprise: { sso_provider: "disabled", sso_domain: "", sso_enforced: false, scim_enabled: false, scim_token_preview: "", retention_days: 365, audit_export_enabled: true, plan: "pro", billing_status: "not_configured" },
    reliability: { telemetry_enabled: true, automatic_backups: false, backup_interval: "daily", last_backup_at: null, offline_queue_enabled: true },
  };
}

export function mergePlatformState(raw: Partial<PlatformState> | null | undefined, workspaceId: string, boardId: string): PlatformState {
  const fallback = createDefaultPlatformState(workspaceId, boardId);
  if (!raw) return fallback;
  return {
    ...fallback,
    ...raw,
    enterprise: { ...fallback.enterprise, ...(raw.enterprise ?? {}) },
    reliability: { ...fallback.reliability, ...(raw.reliability ?? {}) },
    integrations: raw.integrations?.length ? raw.integrations : fallback.integrations,
  };
}

export function calculateFormula(formula: string, item: WorkItem): string {
  const normalized = formula.trim().toLowerCase();
  if (!normalized) return "-";
  if (normalized === "budget / max(progress, 1)") return (item.budget / Math.max(item.progress, 1)).toFixed(1);
  if (normalized === "budget * progress / 100") return String(Math.round(item.budget * item.progress / 100));
  if (normalized === "days remaining") return String(Math.ceil((new Date(`${item.timeline_end}T12:00:00`).getTime() - Date.now()) / 86400000));
  return "Formula ready";
}

export function runItemAutomations(state: PlatformState, boardId: string, item: WorkItem, previous: WorkItem | null, event: "item_created" | "item_updated"): AutomationResult {
  const patch: Partial<WorkItem> = {};
  const runs: AutomationRun[] = [];
  const notices: string[] = [];
  state.automations.filter((recipe) => recipe.board_id === boardId && recipe.enabled).forEach((recipe) => {
    const statusChanged = previous && previous.status !== item.status;
    const matches = (recipe.trigger === "item_created" && event === "item_created") || (recipe.trigger === "status_changed" && statusChanged && (!recipe.trigger_value || recipe.trigger_value === item.status));
    if (!matches) return;
    let message = `${recipe.name} completed`;
    let runStatus: AutomationRun["status"] = "success";
    if (recipe.action === "set_status" && recipe.action_value) patch.status = recipe.action_value as Status;
    if (recipe.action === "assign_owner" && recipe.action_value) patch.owner = recipe.action_value;
    if (recipe.action === "notify") notices.push(`${recipe.name}: ${item.title}`);
    let payload: Record<string, unknown> | undefined;
    if (recipe.action === "send_email" || recipe.action === "call_webhook") {
      runStatus = "queued";
      message = `${recipe.action === "send_email" ? "Email" : "Webhook"} queued for server delivery`;
      payload = recipe.action === "send_email"
        ? { type: "send_email", to: recipe.action_value, subject: `MondayFlow: ${item.title}`, text: `${recipe.name} ran for ${item.title}. Current status: ${item.status}.` }
        : { type: "call_webhook", endpoint: recipe.action_value, body: { automation: recipe.name, item_id: item.id, item_title: item.title, status: item.status } };
    }
    runs.push({ id: crypto.randomUUID(), automation_id: recipe.id, board_id: boardId, item_id: item.id, status: runStatus, message, payload, created_at: new Date().toISOString() });
  });
  return { patch, runs, notices };
}

export function exportOrganization(account: AccountState, snapshot: BoardSnapshot, platform: PlatformState) {
  return JSON.stringify({ exported_at: new Date().toISOString(), account, active_board_snapshot: snapshot, platform }, null, 2);
}
