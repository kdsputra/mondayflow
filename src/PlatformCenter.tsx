import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AppWindow,
  Blocks,
  BookOpenText,
  Bot,
  Check,
  ClipboardList,
  Columns3,
  Download,
  FileText,
  FormInput,
  GitBranch,
  Inbox,
  KeyRound,
  LayoutTemplate,
  Link2,
  Network,
  Plus,
  Play,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UsersRound,
  Webhook,
  X,
} from "lucide-react";
import { exportOrganization, integrationCatalog, type AutomationAction, type AutomationTrigger, type ColumnType, type PlatformState } from "./platform";
import { createScimToken, loadWorkspaceWorkload, startWorkspaceTrial, type WorkloadSummary } from "./database";
import { priorities, statuses, type AccountState, type BoardSnapshot, type Priority, type Status, type View } from "./types";

type MainTab = "customize" | "automations" | "integrations" | "workhub" | "admin";
type HubTab = "docs" | "forms" | "canvas" | "inbox" | "workload";

type CurrentView = { view: View; status: Status | "All"; priority: Priority | "All"; owner: string };

export default function PlatformCenter({ state, workspaceId, boardId, account, snapshot, currentView, canManage, onChange, onApplyView, onNotify, onClose }: {
  state: PlatformState;
  workspaceId: string;
  boardId: string;
  account: AccountState;
  snapshot: BoardSnapshot;
  currentView: CurrentView;
  canManage: boolean;
  onChange: (state: PlatformState) => void;
  onApplyView: (view: CurrentView) => void;
  onNotify: (message: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<MainTab>("customize");
  const board = account.boards.find((entry) => entry.id === boardId)!;
  const workspace = account.workspaces.find((entry) => entry.id === workspaceId)!;
  const tabs: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
    { id: "customize", label: "Build", icon: <Columns3 size={17} /> },
    { id: "automations", label: "Automate", icon: <Bot size={17} /> },
    { id: "integrations", label: "Integrate", icon: <Blocks size={17} /> },
    { id: "workhub", label: "Work hub", icon: <AppWindow size={17} /> },
    { id: "admin", label: "Admin", icon: <ShieldCheck size={17} /> },
  ];

  return <div className="modal-backdrop platform-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="platform-center" role="dialog" aria-modal="true" aria-label="Platform center">
      <aside className="platform-nav">
        <div className="platform-brand"><span><Network size={19} /></span><div><strong>Platform center</strong><small>{workspace.name}</small></div></div>
        <nav>{tabs.map((entry) => <button key={entry.id} className={tab === entry.id ? "active" : ""} onClick={() => setTab(entry.id)}>{entry.icon}<span>{entry.label}</span></button>)}</nav>
        <div className="platform-phase-badge"><Check size={14} /><span>Phases 2-6</span></div>
      </aside>
      <section className="platform-main">
        <header><div><strong>{tabs.find((entry) => entry.id === tab)?.label}</strong><span>{board.title}</span></div><button className="icon-button" onClick={onClose} aria-label="Close Platform center"><X size={19} /></button></header>
        <div className="platform-scroll">
          {tab === "customize" ? <CustomizePanel state={state} boardId={boardId} workspaceId={workspaceId} currentView={currentView} canManage={canManage} onChange={onChange} onApplyView={onApplyView} onNotify={onNotify} /> : null}
          {tab === "automations" ? <AutomationPanel state={state} boardId={boardId} canManage={canManage} onChange={onChange} onNotify={onNotify} /> : null}
          {tab === "integrations" ? <IntegrationPanel state={state} workspaceId={workspaceId} canManage={canManage} onChange={onChange} onNotify={onNotify} /> : null}
          {tab === "workhub" ? <WorkHubPanel state={state} workspaceId={workspaceId} boardId={boardId} account={account} snapshot={snapshot} canManage={canManage} onChange={onChange} onNotify={onNotify} /> : null}
          {tab === "admin" ? <AdminPanel state={state} workspaceId={workspaceId} account={account} snapshot={snapshot} canManage={canManage} onChange={onChange} onNotify={onNotify} /> : null}
        </div>
      </section>
    </div>
  </div>;
}

function CustomizePanel({ state, boardId, workspaceId, currentView, canManage, onChange, onApplyView, onNotify }: { state: PlatformState; boardId: string; workspaceId: string; currentView: CurrentView; canManage: boolean; onChange: (state: PlatformState) => void; onApplyView: (view: CurrentView) => void; onNotify: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ColumnType>("text");
  const [configuration, setConfiguration] = useState("");
  const [viewName, setViewName] = useState("");
  const columns = state.customColumns.filter((entry) => entry.board_id === boardId);
  const views = state.savedViews.filter((entry) => entry.board_id === boardId);
  const templates = state.templates.filter((entry) => entry.workspace_id === workspaceId);

  function addColumn() {
    if (title.trim().length < 2) return;
    const options = type === "dropdown" ? configuration.split(",").map((value) => value.trim()).filter(Boolean) : [];
    const formula = type === "formula" ? configuration.trim() || "budget * progress / 100" : "";
    onChange({ ...state, customColumns: [...state.customColumns, { id: crypto.randomUUID(), board_id: boardId, title: title.trim(), type, options, formula }] });
    setTitle(""); setConfiguration("");
    onNotify("Custom column added to the board.");
  }

  function saveView() {
    if (viewName.trim().length < 2) return;
    onChange({ ...state, savedViews: [...state.savedViews, { id: crypto.randomUUID(), board_id: boardId, name: viewName.trim(), ...currentView }] });
    setViewName("");
    onNotify("Board view saved.");
  }

  function applyTemplate(templateId: string) {
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return;
    const newColumns = template.columns.map((column) => ({ ...column, id: crypto.randomUUID(), board_id: boardId }));
    onChange({ ...state, customColumns: [...state.customColumns, ...newColumns] });
    onNotify(`${template.name} template applied.`);
  }

  return <div className="platform-content">
    <SectionTitle icon={<Columns3 size={18} />} title="Column builder" description="Add editable data, people, dependency, and calculated formula columns." />
    <div className="builder-row"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Column name" disabled={!canManage} /><select value={type} onChange={(event) => setType(event.target.value as ColumnType)} disabled={!canManage}>{["text", "number", "date", "dropdown", "checkbox", "formula", "people", "dependency"].map((entry) => <option key={entry}>{entry}</option>)}</select>{type === "dropdown" || type === "formula" ? <input value={configuration} onChange={(event) => setConfiguration(event.target.value)} placeholder={type === "formula" ? "budget * progress / 100" : "Web, Email, Social"} disabled={!canManage} /> : <span /> }<button className="primary-button" disabled={!canManage || title.trim().length < 2} onClick={addColumn}><Plus size={16} /> Add column</button></div>
    <div className="config-list">{columns.map((column) => <div key={column.id}><span className={`config-type type-${column.type}`}>{column.type === "dependency" ? <GitBranch size={15} /> : <Columns3 size={15} />}</span><div><strong>{column.title}</strong><small>{column.type === "formula" ? column.formula : column.options.join(", ") || `${column.type} values`}</small></div><button className="icon-button small" disabled={!canManage} onClick={() => onChange({ ...state, customColumns: state.customColumns.filter((entry) => entry.id !== column.id) })} aria-label={`Delete ${column.title}`}><Trash2 size={15} /></button></div>)}</div>

    <div className="platform-divider" />
    <SectionTitle icon={<Save size={18} />} title="Saved views" description="Preserve the current layout and filters for repeatable workflows." />
    <div className="builder-row compact-builder"><input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="View name" /><button className="primary-button" disabled={viewName.trim().length < 2} onClick={saveView}><Save size={16} /> Save current view</button></div>
    <div className="saved-view-list">{views.map((saved) => <button key={saved.id} onClick={() => onApplyView(saved)}><span><LayoutTemplate size={16} /></span><div><strong>{saved.name}</strong><small>{saved.view} · {saved.status} · {saved.priority} · {saved.owner}</small></div><Check size={15} /></button>)}</div>

    <div className="platform-divider" />
    <SectionTitle icon={<LayoutTemplate size={18} />} title="Board templates" description="Apply reusable workflow structures without replacing existing work." />
    <div className="template-grid">{templates.map((template) => <article key={template.id}><span><LayoutTemplate size={18} /></span><strong>{template.name}</strong><p>{template.description}</p><small>{template.columns.length} custom columns</small><button className="secondary-button" disabled={!canManage} onClick={() => applyTemplate(template.id)}>Apply template</button></article>)}</div>
  </div>;
}

function AutomationPanel({ state, boardId, canManage, onChange, onNotify }: { state: PlatformState; boardId: string; canManage: boolean; onChange: (state: PlatformState) => void; onNotify: (message: string) => void }) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>("status_changed");
  const [triggerValue, setTriggerValue] = useState("Stuck");
  const [action, setAction] = useState<AutomationAction>("notify");
  const [actionValue, setActionValue] = useState("Board admins");
  const recipes = state.automations.filter((entry) => entry.board_id === boardId);

  function addRecipe() {
    if (name.trim().length < 2) return;
    onChange({ ...state, automations: [...state.automations, { id: crypto.randomUUID(), board_id: boardId, name: name.trim(), trigger, trigger_value: triggerValue.trim(), action, action_value: actionValue.trim(), enabled: true, last_run_at: null }] });
    setName(""); onNotify("Automation enabled.");
  }

  function runNow(id: string) {
    const now = new Date().toISOString();
    const run = { id: crypto.randomUUID(), automation_id: id, board_id: boardId, item_id: null, status: "success" as const, message: "Manual test completed", created_at: now };
    onChange({ ...state, automations: state.automations.map((entry) => entry.id === id ? { ...entry, last_run_at: now } : entry), automationRuns: [run, ...state.automationRuns].slice(0, 100) });
    onNotify("Automation test completed.");
  }

  return <div className="platform-content">
    <SectionTitle icon={<Bot size={18} />} title="Automation recipes" description="Rules run on board events; email and webhook actions are queued for the server worker." />
    <div className="automation-builder"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Automation name" disabled={!canManage} /><label>When<select value={trigger} onChange={(event) => setTrigger(event.target.value as AutomationTrigger)} disabled={!canManage}><option value="item_created">item is created</option><option value="status_changed">status changes</option><option value="date_arrived">date arrives</option><option value="webhook_received">webhook is received</option></select></label><input value={triggerValue} onChange={(event) => setTriggerValue(event.target.value)} placeholder="Trigger value" disabled={!canManage} /><label>Then<select value={action} onChange={(event) => setAction(event.target.value as AutomationAction)} disabled={!canManage}><option value="notify">notify</option><option value="set_status">set status</option><option value="assign_owner">assign owner</option><option value="send_email">send email</option><option value="call_webhook">call webhook</option></select></label><input value={actionValue} onChange={(event) => setActionValue(event.target.value)} placeholder="Action target or value" disabled={!canManage} /><button className="primary-button" disabled={!canManage || name.trim().length < 2} onClick={addRecipe}><Plus size={16} /> Create recipe</button></div>
    <div className="automation-list">{recipes.map((recipe) => <article key={recipe.id}><label className="switch"><input type="checkbox" checked={recipe.enabled} disabled={!canManage} onChange={(event) => onChange({ ...state, automations: state.automations.map((entry) => entry.id === recipe.id ? { ...entry, enabled: event.target.checked } : entry) })} /><span /></label><div><strong>{recipe.name}</strong><p>When <b>{recipe.trigger.replaceAll("_", " ")}</b>{recipe.trigger_value ? ` is ${recipe.trigger_value}` : ""}, then <b>{recipe.action.replaceAll("_", " ")}</b> {recipe.action_value}.</p><small>{recipe.last_run_at ? `Last run ${new Date(recipe.last_run_at).toLocaleString()}` : "Not run yet"}</small></div><button className="secondary-button" onClick={() => runNow(recipe.id)}><Play size={15} /> Test</button><button className="icon-button small" disabled={!canManage} onClick={() => onChange({ ...state, automations: state.automations.filter((entry) => entry.id !== recipe.id) })} aria-label={`Delete ${recipe.name}`}><Trash2 size={15} /></button></article>)}</div>
    <div className="platform-divider" />
    <SectionTitle icon={<Activity size={18} />} title="Run history" description="A durable record of completed and queued automation actions." />
    <div className="run-list">{state.automationRuns.filter((entry) => entry.board_id === boardId).slice(0, 12).map((run) => <div key={run.id}><span className={`run-status ${run.status}`}>{run.status}</span><strong>{run.message}</strong><time>{new Date(run.created_at).toLocaleString()}</time></div>)}{!state.automationRuns.some((entry) => entry.board_id === boardId) ? <Empty icon={<Activity size={22} />} text="Automation runs will appear here." /> : null}</div>
  </div>;
}

function IntegrationPanel({ state, workspaceId, canManage, onChange, onNotify }: { state: PlatformState; workspaceId: string; canManage: boolean; onChange: (state: PlatformState) => void; onNotify: (message: string) => void }) {
  function updateConnection(provider: string, endpoint: string) {
    onChange({ ...state, integrations: state.integrations.map((entry) => entry.workspace_id === workspaceId && entry.provider === provider ? { ...entry, endpoint, status: endpoint.trim() ? "ready" : "not_configured", updated_at: new Date().toISOString() } : entry) });
  }
  return <div className="platform-content">
    <SectionTitle icon={<Blocks size={18} />} title="Integration hub" description="Configure callback destinations here; OAuth secrets stay in server environment variables." />
    <div className="integration-grid">{integrationCatalog.map((catalog) => { const connection = state.integrations.find((entry) => entry.workspace_id === workspaceId && entry.provider === catalog.provider); const status = connection?.status ?? "not_configured"; return <article key={catalog.provider}><div className="integration-heading"><span>{integrationInitials(catalog.name)}</span><div><strong>{catalog.name}</strong><small className={`connection-status ${status}`}>{status.replaceAll("_", " ")}</small></div></div><p>{catalog.description}</p><label>Server callback or webhook URL<input value={connection?.endpoint ?? ""} disabled={!canManage} placeholder="https://your-domain.com/api/callback" onChange={(event) => updateConnection(catalog.provider, event.target.value)} /></label><button className="secondary-button" disabled={!canManage || !connection?.endpoint} onClick={() => onNotify(`${catalog.name} configuration saved. Complete the OAuth handshake on the server.`)}><Webhook size={15} /> Verify configuration</button></article>; })}</div>
    <div className="integration-note"><KeyRound size={17} /><div><strong>Secrets are server-only</strong><span>The browser stores connection metadata, never OAuth client secrets or access tokens. Edge Function templates are included for handshakes and token refresh.</span></div></div>
  </div>;
}

function WorkHubPanel({ state, workspaceId, boardId, account, snapshot, canManage, onChange, onNotify }: { state: PlatformState; workspaceId: string; boardId: string; account: AccountState; snapshot: BoardSnapshot; canManage: boolean; onChange: (state: PlatformState) => void; onNotify: (message: string) => void }) {
  const [hubTab, setHubTab] = useState<HubTab>("docs");
  const tabs: Array<{ id: HubTab; label: string; icon: React.ReactNode }> = [{ id: "docs", label: "Docs", icon: <BookOpenText size={15} /> }, { id: "forms", label: "Forms", icon: <FormInput size={15} /> }, { id: "canvas", label: "Canvas", icon: <Network size={15} /> }, { id: "inbox", label: "Inbox", icon: <Inbox size={15} /> }, { id: "workload", label: "Workload", icon: <UsersRound size={15} /> }];
  return <div className="platform-content"><div className="hub-tabs">{tabs.map((entry) => <button className={hubTab === entry.id ? "active" : ""} onClick={() => setHubTab(entry.id)} key={entry.id}>{entry.icon}{entry.label}</button>)}</div>
    {hubTab === "docs" ? <DocsPanel state={state} workspaceId={workspaceId} boardId={boardId} canManage={canManage} onChange={onChange} /> : null}
    {hubTab === "forms" ? <FormsPanel state={state} boardId={boardId} canManage={canManage} onChange={onChange} onNotify={onNotify} /> : null}
    {hubTab === "canvas" ? <CanvasPanel state={state} boardId={boardId} canManage={canManage} onChange={onChange} /> : null}
    {hubTab === "inbox" ? <InboxPanel state={state} workspaceId={workspaceId} onChange={onChange} /> : null}
    {hubTab === "workload" ? <WorkloadPanel account={account} workspaceId={workspaceId} snapshot={snapshot} /> : null}
  </div>;
}

function DocsPanel({ state, workspaceId, boardId, canManage, onChange }: { state: PlatformState; workspaceId: string; boardId: string; canManage: boolean; onChange: (state: PlatformState) => void }) {
  const docs = state.docs.filter((entry) => entry.workspace_id === workspaceId);
  const [selectedId, setSelectedId] = useState(docs[0]?.id ?? "");
  const selected = docs.find((entry) => entry.id === selectedId) ?? docs[0];
  function addDoc() { const doc = { id: crypto.randomUUID(), workspace_id: workspaceId, board_id: boardId, title: "Untitled doc", content: "# Untitled doc\n\nStart writing...", updated_at: new Date().toISOString() }; onChange({ ...state, docs: [...state.docs, doc] }); setSelectedId(doc.id); }
  function updateDoc(patch: { title?: string; content?: string }) { if (!selected) return; onChange({ ...state, docs: state.docs.map((entry) => entry.id === selected.id ? { ...entry, ...patch, updated_at: new Date().toISOString() } : entry) }); }
  return <div className="docs-layout"><aside><button className="secondary-button full-button" disabled={!canManage} onClick={addDoc}><Plus size={15} /> New doc</button>{docs.map((doc) => <button className={doc.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(doc.id)} key={doc.id}><FileText size={15} /><span>{doc.title}</span></button>)}</aside>{selected ? <div className="doc-editor"><input className="doc-title" value={selected.title} disabled={!canManage} onChange={(event) => updateDoc({ title: event.target.value })} /><textarea value={selected.content} disabled={!canManage} onChange={(event) => updateDoc({ content: event.target.value })} /><small>Saved {new Date(selected.updated_at).toLocaleTimeString()}</small></div> : <Empty icon={<FileText size={22} />} text="Create the first workspace doc." />}</div>;
}

function FormsPanel({ state, boardId, canManage, onChange, onNotify }: { state: PlatformState; boardId: string; canManage: boolean; onChange: (state: PlatformState) => void; onNotify: (message: string) => void }) {
  const forms = state.forms.filter((entry) => entry.board_id === boardId);
  const form = forms[0];
  const [fieldLabel, setFieldLabel] = useState("");
  function updateForm(patch: Partial<NonNullable<typeof form>>) { if (!form) return; onChange({ ...state, forms: state.forms.map((entry) => entry.id === form.id ? { ...entry, ...patch } : entry) }); }
  function addField() { if (!form || fieldLabel.trim().length < 2) return; updateForm({ fields: [...form.fields, { id: crypto.randomUUID(), label: fieldLabel.trim(), type: "text", required: false, options: [] }] }); setFieldLabel(""); }
  function submitPreview() { if (!form) return; const values = Object.fromEntries(form.fields.map((field) => [field.id, `Sample ${field.label}`])); onChange({ ...state, submissions: [{ id: crypto.randomUUID(), form_id: form.id, values, created_at: new Date().toISOString() }, ...state.submissions] }); onNotify("Preview response submitted and stored."); }
  function copyPublicLink() { const url = new URL(window.location.href); url.search = ""; url.searchParams.set("form", form.id); void navigator.clipboard.writeText(url.toString()); onNotify("Public form link copied."); }
  if (!form) return <Empty icon={<FormInput size={22} />} text="No form is attached to this board." />;
  return <div className="forms-layout"><section><SectionTitle icon={<FormInput size={18} />} title="Form builder" description="Published responses are retained and can feed item-creation automations." /><label>Form title<input value={form.title} disabled={!canManage} onChange={(event) => updateForm({ title: event.target.value })} /></label><label>Description<textarea value={form.description} disabled={!canManage} onChange={(event) => updateForm({ description: event.target.value })} /></label><div className="form-fields">{form.fields.map((field) => <div key={field.id}><ClipboardList size={16} /><input value={field.label} disabled={!canManage} onChange={(event) => updateForm({ fields: form.fields.map((entry) => entry.id === field.id ? { ...entry, label: event.target.value } : entry) })} /><select value={field.type} disabled={!canManage} onChange={(event) => updateForm({ fields: form.fields.map((entry) => entry.id === field.id ? { ...entry, type: event.target.value as typeof field.type } : entry) })}><option value="text">Text</option><option value="email">Email</option><option value="long_text">Long text</option><option value="date">Date</option><option value="dropdown">Dropdown</option></select><label><input type="checkbox" checked={field.required} disabled={!canManage} onChange={(event) => updateForm({ fields: form.fields.map((entry) => entry.id === field.id ? { ...entry, required: event.target.checked } : entry) })} /> Required</label><button className="icon-button small" disabled={!canManage} onClick={() => updateForm({ fields: form.fields.filter((entry) => entry.id !== field.id) })} aria-label={`Delete ${field.label}`}><Trash2 size={14} /></button></div>)}</div><div className="builder-row compact-builder"><input value={fieldLabel} onChange={(event) => setFieldLabel(event.target.value)} placeholder="New field label" disabled={!canManage} /><button className="secondary-button" disabled={!canManage || fieldLabel.trim().length < 2} onClick={addField}><Plus size={15} /> Add field</button></div><label className="publish-toggle"><input type="checkbox" checked={form.published} disabled={!canManage} onChange={(event) => updateForm({ published: event.target.checked })} /> Published and accepting responses</label><button className="secondary-button" disabled={!form.published} onClick={copyPublicLink}><Link2 size={15} /> Copy public link</button></section><section className="form-preview"><small>FORM PREVIEW</small><h3>{form.title}</h3><p>{form.description}</p>{form.fields.map((field) => <label key={field.id}>{field.label}{field.required ? " *" : ""}{field.type === "long_text" ? <textarea disabled /> : <input type={field.type === "date" ? "date" : field.type === "email" ? "email" : "text"} disabled />}</label>)}<button className="primary-button" disabled={!form.published} onClick={submitPreview}>Submit preview response</button><span>{state.submissions.filter((entry) => entry.form_id === form.id).length} stored responses</span></section></div>;
}

function CanvasPanel({ state, boardId, canManage, onChange }: { state: PlatformState; boardId: string; canManage: boolean; onChange: (state: PlatformState) => void }) {
  const nodes = state.canvasNodes.filter((entry) => entry.board_id === boardId);
  const edges = state.canvasEdges.filter((entry) => entry.board_id === boardId);
  const [selected, setSelected] = useState<string | null>(null);
  function addNode() { const index = nodes.length; onChange({ ...state, canvasNodes: [...state.canvasNodes, { id: crypto.randomUUID(), board_id: boardId, text: "New idea", color: ["blue", "green", "yellow", "pink"][index % 4] as "blue", x: 8 + (index * 19) % 75, y: 12 + (index * 17) % 62 }] }); }
  function chooseNode(id: string) { if (!selected) return setSelected(id); if (selected === id) return setSelected(null); const exists = edges.some((edge) => edge.from === selected && edge.to === id); if (!exists) onChange({ ...state, canvasEdges: [...state.canvasEdges, { id: crypto.randomUUID(), board_id: boardId, from: selected, to: id }] }); setSelected(null); }
  return <div><div className="canvas-toolbar"><div><strong>Campaign canvas</strong><span>Select two notes to connect them.</span></div><button className="primary-button" disabled={!canManage} onClick={addNode}><Plus size={15} /> Add note</button></div><div className="work-canvas"><svg aria-hidden="true">{edges.map((edge) => { const from = nodes.find((node) => node.id === edge.from); const to = nodes.find((node) => node.id === edge.to); return from && to ? <line key={edge.id} x1={`${from.x + 8}%`} y1={`${from.y + 7}%`} x2={`${to.x + 8}%`} y2={`${to.y + 7}%`} /> : null; })}</svg>{nodes.map((node) => <button key={node.id} className={`canvas-note ${node.color} ${selected === node.id ? "selected" : ""}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => canManage && chooseNode(node.id)}><textarea value={node.text} disabled={!canManage} onClick={(event) => event.stopPropagation()} onChange={(event) => onChange({ ...state, canvasNodes: state.canvasNodes.map((entry) => entry.id === node.id ? { ...entry, text: event.target.value } : entry) })} /></button>)}</div></div>;
}

function InboxPanel({ state, workspaceId, onChange }: { state: PlatformState; workspaceId: string; onChange: (state: PlatformState) => void }) {
  const inbox = state.inbox.filter((entry) => entry.workspace_id === workspaceId);
  return <div><div className="inbox-heading"><div><strong>Workspace inbox</strong><span>{inbox.filter((entry) => !entry.read).length} unread</span></div><button className="secondary-button" onClick={() => onChange({ ...state, inbox: state.inbox.map((entry) => entry.workspace_id === workspaceId ? { ...entry, read: true } : entry) })}>Mark all read</button></div><div className="hub-inbox">{inbox.map((entry) => <button key={entry.id} className={entry.read ? "read" : ""} onClick={() => onChange({ ...state, inbox: state.inbox.map((message) => message.id === entry.id ? { ...message, read: true } : message) })}><span><Inbox size={16} /></span><div><strong>{entry.title}</strong><p>{entry.body}</p><time>{new Date(entry.created_at).toLocaleString()}</time></div>{!entry.read ? <i /> : null}</button>)}</div></div>;
}

function WorkloadPanel({ account, workspaceId, snapshot }: { account: AccountState; workspaceId: string; snapshot: BoardSnapshot }) {
  const members = account.members.filter((entry) => entry.workspace_id === workspaceId && entry.role !== "guest");
  const boards = account.boards.filter((entry) => entry.workspace_id === workspaceId);
  const [workload, setWorkload] = useState<WorkloadSummary[]>([]);
  useEffect(() => { loadWorkspaceWorkload(workspaceId).then(setWorkload).catch(() => setWorkload([])); }, [workspaceId]);
  return <div><SectionTitle icon={<UsersRound size={18} />} title="Cross-board workload" description="Capacity view combines member assignments across every accessible board in this workspace." /><div className="portfolio-strip">{boards.map((board) => <div key={board.id}><span>{board.privacy}</span><strong>{board.title}</strong><small>{board.id === snapshot.items[0]?.board_id ? `${snapshot.items.length} loaded items` : "Included in workspace rollup"}</small></div>)}</div><div className="workload-table"><div className="workload-head"><span>Member</span><span>Assigned</span><span>Boards</span><span>Load</span></div>{members.map((member) => { const summary = workload.find((entry) => entry.user_id === member.user_id); const assigned = summary?.assigned_count ?? 0; const capacity = 5; return <div key={member.user_id}><span><b>{initials(member.profile.full_name)}</b><strong>{member.profile.full_name}</strong></span><span>{assigned}</span><span>{summary?.board_count ?? 0} boards</span><span><i><em style={{ width: `${Math.min(100, assigned / capacity * 100)}%` }} /></i>{Math.round(assigned / capacity * 100)}%</span></div>; })}</div></div>;
}

function AdminPanel({ state, workspaceId, account, snapshot, canManage, onChange, onNotify }: { state: PlatformState; workspaceId: string; account: AccountState; snapshot: BoardSnapshot; canManage: boolean; onChange: (state: PlatformState) => void; onNotify: (message: string) => void }) {
  const settings = state.enterprise;
  function update(patch: Partial<typeof settings>) { onChange({ ...state, enterprise: { ...settings, ...patch } }); }
  async function generateScimToken() { try { const token = await createScimToken(workspaceId); update({ scim_enabled: true, scim_token_preview: `${token.slice(0, 20)}...` }); await navigator.clipboard.writeText(token); onNotify("SCIM token generated and copied. It will not be shown again."); } catch (caught) { onNotify((caught as Error).message); } }
  async function startTrial() { try { await startWorkspaceTrial(workspaceId, settings.plan); update({ billing_status: "trial" }); onNotify("14-day trial started. Paid activation requires a verified Stripe webhook."); } catch (caught) { onNotify((caught as Error).message); } }
  function downloadExport() { const blob = new Blob([exportOrganization(account, snapshot, state)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `mondayflow-organization-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); }
  return <div className="platform-content admin-grid">
    {!canManage ? <div className="admin-warning"><ShieldCheck size={17} /> Only workspace owners and admins can change enterprise controls.</div> : null}
    <section><SectionTitle icon={<KeyRound size={18} />} title="Single sign-on" description="Prepare SAML or OIDC domain enforcement." /><label>Provider<select value={settings.sso_provider} disabled={!canManage} onChange={(event) => update({ sso_provider: event.target.value as typeof settings.sso_provider })}><option value="disabled">Disabled</option><option value="saml">SAML 2.0</option><option value="oidc">OpenID Connect</option></select></label><label>Verified company domain<input value={settings.sso_domain} disabled={!canManage} placeholder="company.com" onChange={(event) => update({ sso_domain: event.target.value })} /></label><label className="publish-toggle"><input type="checkbox" checked={settings.sso_enforced} disabled={!canManage || settings.sso_provider === "disabled" || !settings.sso_domain} onChange={(event) => update({ sso_enforced: event.target.checked })} /> Require SSO for this domain</label></section>
    <section><SectionTitle icon={<Network size={18} />} title="SCIM provisioning" description="Provision and suspend members through your identity provider." /><div className="token-box"><code>{settings.scim_token_preview || "No provisioning token"}</code><button className="secondary-button" disabled={!canManage} onClick={generateScimToken}><KeyRound size={15} /> Generate token</button></div><small>Complete tokens are generated and hashed by the SCIM Edge Function in production.</small></section>
    <section><SectionTitle icon={<ShieldCheck size={18} />} title="Retention and audit" description="Control data lifetime and organization exports." /><label>Retention period<select value={settings.retention_days} disabled={!canManage} onChange={(event) => update({ retention_days: Number(event.target.value) })}><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="1095">3 years</option><option value="3650">10 years</option></select></label><button className="secondary-button" disabled={!canManage || !settings.audit_export_enabled} onClick={downloadExport}><Download size={15} /> Export organization JSON</button></section>
    <section><SectionTitle icon={<Settings2 size={18} />} title="Plan and billing" description="Trials are stored in the database; paid state is controlled only by verified Stripe webhooks." /><label>Plan<select value={settings.plan} disabled={!canManage} onChange={(event) => update({ plan: event.target.value as typeof settings.plan, billing_status: "not_configured" })}><option value="free">Free</option><option value="standard">Standard</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label><div className="billing-summary"><span>Status</span><strong>{settings.billing_status.replaceAll("_", " ")}</strong><span>Seats</span><strong>{account.members.length}</strong></div><button className="primary-button" disabled={!canManage || settings.plan === "free"} onClick={() => void startTrial()}>Start 14-day trial</button></section>
  </div>;
}

function SectionTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) { return <div className="platform-section-title"><span>{icon}</span><div><strong>{title}</strong><p>{description}</p></div></div>; }
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="platform-empty">{icon}<span>{text}</span></div>; }
function integrationInitials(value: string) { return value.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
