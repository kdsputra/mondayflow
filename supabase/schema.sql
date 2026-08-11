create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default 'Member',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer', 'guest')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  privacy text not null default 'main' check (privacy in ('main', 'private', 'shareable')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer', 'guest')),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null default auth.uid() references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table public.workspace_invitations drop constraint if exists workspace_invitations_workspace_id_email_status_key;
create unique index if not exists workspace_invitations_pending_email_idx
on public.workspace_invitations(workspace_id, lower(email)) where status = 'pending';

create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.boards(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  title text not null,
  group_name text not null default 'This week',
  owner text not null default 'Unassigned',
  status text not null default 'Not started' check (status in ('Done', 'Working on it', 'Stuck', 'Not started')),
  priority text not null default 'Medium' check (priority in ('Critical', 'High', 'Medium', 'Low')),
  timeline_start date not null default current_date,
  timeline_end date not null default current_date + 7,
  progress integer not null default 0 check (progress between 0 and 100),
  budget numeric(12, 2) not null default 0 check (budget >= 0),
  description text not null default '',
  custom_values jsonb not null default '{}'::jsonb,
  parent_id uuid references public.work_items(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe upgrades from the single-user prototype.
alter table public.work_items add column if not exists board_id uuid references public.boards(id) on delete cascade;
alter table public.work_items add column if not exists owner_id uuid default auth.uid();
alter table public.work_items add column if not exists description text not null default '';
alter table public.work_items add column if not exists custom_values jsonb not null default '{}'::jsonb;
alter table public.work_items add column if not exists parent_id uuid references public.work_items(id) on delete cascade;
alter table public.work_items add column if not exists sort_order integer not null default 0;
alter table public.work_items add column if not exists created_at timestamptz not null default now();

create table if not exists public.item_updates (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.boards(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  item_id uuid not null references public.work_items(id) on delete cascade,
  author text not null default 'Team member',
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
alter table public.item_updates add column if not exists board_id uuid references public.boards(id) on delete cascade;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.boards(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  item_id uuid references public.work_items(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
alter table public.activity_logs add column if not exists board_id uuid references public.boards(id) on delete cascade;

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  item_id uuid not null references public.work_items(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  uploaded_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id, status);
create index if not exists boards_workspace_idx on public.boards(workspace_id, updated_at desc);
create index if not exists board_members_user_idx on public.board_members(user_id);
create index if not exists work_items_board_sort_idx on public.work_items(board_id, sort_order);
create index if not exists work_items_parent_idx on public.work_items(parent_id);
create index if not exists item_updates_board_created_idx on public.item_updates(board_id, created_at desc);
create index if not exists activity_logs_board_created_idx on public.activity_logs(board_id, created_at desc);
create index if not exists attachments_item_idx on public.attachments(item_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.workspace_role(p_workspace_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.workspace_members
  where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.can_manage_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.workspace_role(p_workspace_id) in ('owner', 'admin'), false);
$$;

create or replace function public.can_edit_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.workspace_role(p_workspace_id) in ('owner', 'admin', 'member'), false);
$$;

create or replace function public.shares_workspace(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid() and mine.status = 'active'
      and theirs.user_id = p_user_id and theirs.status = 'active'
  );
$$;

create or replace function public.can_access_board(p_board_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = p_board_id and wm.user_id = auth.uid() and wm.status = 'active'
      and (
        wm.role in ('owner', 'admin')
        or (b.privacy = 'main' and wm.role <> 'guest')
        or (
          exists (select 1 from public.board_members bm where bm.board_id = b.id and bm.user_id = auth.uid())
          and (wm.role <> 'guest' or b.privacy = 'shareable')
        )
      )
  );
$$;

create or replace function public.can_edit_board(p_board_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = p_board_id and wm.user_id = auth.uid() and wm.status = 'active'
      and (
        wm.role in ('owner', 'admin')
        or (b.privacy = 'main' and wm.role = 'member')
        or (
          exists (select 1 from public.board_members bm where bm.board_id = b.id and bm.user_id = auth.uid() and bm.role in ('owner', 'editor'))
          and (wm.role <> 'guest' or b.privacy = 'shareable')
        )
      )
  );
$$;

create or replace function public.can_manage_board(p_board_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.boards b
    join public.workspace_members wm on wm.workspace_id = b.workspace_id
    where b.id = p_board_id and wm.user_id = auth.uid() and wm.status = 'active'
      and (
        wm.role in ('owner', 'admin') or b.created_by = auth.uid()
        or exists (select 1 from public.board_members bm where bm.board_id = b.id and bm.user_id = auth.uid() and bm.role = 'owner')
      )
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'Member'), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
for each row execute function public.handle_new_user();

create or replace function public.add_board_creator_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.board_members (board_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (board_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists on_board_created on public.boards;
create trigger on_board_created after insert on public.boards
for each row execute function public.add_board_creator_membership();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists workspaces_touch_updated_at on public.workspaces;
create trigger workspaces_touch_updated_at before update on public.workspaces for each row execute function public.touch_updated_at();
drop trigger if exists boards_touch_updated_at on public.boards;
create trigger boards_touch_updated_at before update on public.boards for each row execute function public.touch_updated_at();
drop trigger if exists work_items_touch_updated_at on public.work_items;
create trigger work_items_touch_updated_at before update on public.work_items for each row execute function public.touch_updated_at();

create or replace function public.bootstrap_account()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_workspace_id uuid;
  v_board_id uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  select id, coalesce(email, ''), coalesce(raw_user_meta_data->>'full_name', split_part(coalesce(email, 'Member'), '@', 1)), raw_user_meta_data->>'avatar_url'
  from auth.users where id = auth.uid()
  on conflict (id) do update set email = excluded.email;

  select workspace_id into v_workspace_id
  from public.workspace_members where user_id = auth.uid() and status = 'active'
  order by joined_at limit 1;

  if v_workspace_id is null then
    select coalesce(full_name, 'My') into v_name from public.profiles where id = auth.uid();
    insert into public.workspaces (name, slug, created_by)
    values (v_name || '''s Workspace', 'workspace-' || substr(gen_random_uuid()::text, 1, 8), auth.uid())
    returning id into v_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, auth.uid(), 'owner');

    insert into public.boards (workspace_id, title, description, privacy, created_by)
    values (v_workspace_id, 'Growth Campaign Board', 'Plan launches, assign owners, track timelines, and keep execution visible.', 'main', auth.uid())
    returning id into v_board_id;
  else
    select id into v_board_id from public.boards where workspace_id = v_workspace_id order by created_at limit 1;
  end if;

  if v_board_id is not null then
    update public.work_items set board_id = v_board_id where board_id is null and owner_id = auth.uid();
    update public.item_updates u set board_id = i.board_id from public.work_items i where u.board_id is null and u.item_id = i.id;
    update public.activity_logs a set board_id = i.board_id from public.work_items i where a.board_id is null and a.item_id = i.id;
  end if;
  return v_workspace_id;
end;
$$;

create or replace function public.create_workspace_with_owner(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_name)) < 2 then raise exception 'Workspace name is too short'; end if;
  insert into public.workspaces (name, slug, created_by)
  values (trim(p_name), lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 6), auth.uid())
  returning id into v_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_workspace_id, auth.uid(), 'owner');
  insert into public.boards (workspace_id, title, description, privacy, created_by)
  values (v_workspace_id, 'My first board', 'Plan and track work with your team.', 'main', auth.uid());
  return v_workspace_id;
end;
$$;

create or replace function public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text)
returns public.workspace_invitations language plpgsql security definer set search_path = public as $$
declare v_invitation public.workspace_invitations;
begin
  if not public.can_manage_workspace(p_workspace_id) then raise exception 'Insufficient workspace permission'; end if;
  if p_role not in ('admin', 'member', 'viewer', 'guest') then raise exception 'Invalid invitation role'; end if;
  update public.workspace_invitations set status = 'revoked'
  where workspace_id = p_workspace_id and lower(email) = lower(trim(p_email)) and status = 'pending';
  insert into public.workspace_invitations (workspace_id, email, role, invited_by)
  values (p_workspace_id, lower(trim(p_email)), p_role, auth.uid()) returning * into v_invitation;
  return v_invitation;
end;
$$;

create or replace function public.accept_workspace_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_invitation public.workspace_invitations;
declare v_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select lower(coalesce(email, '')) into v_email from auth.users where id = auth.uid();
  select * into v_invitation from public.workspace_invitations where token = p_token and status = 'pending' for update;
  if v_invitation.id is null then raise exception 'Invitation not found'; end if;
  if v_invitation.expires_at < now() then
    update public.workspace_invitations set status = 'expired' where id = v_invitation.id;
    raise exception 'Invitation expired';
  end if;
  if lower(v_invitation.email) <> v_email then raise exception 'Sign in with the invited email address'; end if;
  insert into public.workspace_members (workspace_id, user_id, role, status)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role, 'active')
  on conflict (workspace_id, user_id) do update set role = excluded.role, status = 'active';
  update public.workspace_invitations set status = 'accepted', accepted_at = now() where id = v_invitation.id;
  return v_invitation.workspace_id;
end;
$$;

create or replace function public.set_workspace_member_role(p_workspace_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_workspace(p_workspace_id) then raise exception 'Insufficient workspace permission'; end if;
  if p_role not in ('owner', 'admin', 'member', 'viewer', 'guest') then raise exception 'Invalid role'; end if;
  if p_user_id = auth.uid() and public.workspace_role(p_workspace_id) = 'owner' and p_role <> 'owner' then raise exception 'Workspace owner cannot demote themselves'; end if;
  update public.workspace_members set role = p_role where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_workspace(p_workspace_id) then raise exception 'Insufficient workspace permission'; end if;
  if exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner') then raise exception 'Workspace owner cannot be removed'; end if;
  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$$;

create table if not exists public.workspace_feature_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null,
  board_id uuid not null references public.boards(id) on delete cascade,
  item_id uuid references public.work_items(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  message text not null default '',
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists automation_jobs_queue_idx on public.automation_jobs(status, scheduled_for);
create index if not exists automation_jobs_board_idx on public.automation_jobs(board_id, created_at desc);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('google-calendar','outlook-calendar','slack','teams','google-drive','github','jira','hubspot')),
  status text not null default 'not_configured' check (status in ('not_configured','ready','connected','error','revoked')),
  config jsonb not null default '{}'::jsonb,
  secret_ref text,
  connected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create table if not exists public.organization_security (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  sso_provider text not null default 'disabled' check (sso_provider in ('disabled','saml','oidc')),
  verified_domain text not null default '',
  sso_enforced boolean not null default false,
  scim_enabled boolean not null default false,
  retention_days integer not null default 365 check (retention_days between 1 and 3650),
  updated_at timestamptz not null default now()
);

create table if not exists public.scim_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_hash text not null,
  token_preview text not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_accounts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  provider_customer_id text unique,
  provider_subscription_id text unique,
  plan text not null default 'free' check (plan in ('free','standard','pro','enterprise')),
  status text not null default 'not_configured' check (status in ('trial','active','past_due','cancelled','not_configured')),
  seats integer not null default 1 check (seats > 0),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.public_form_submissions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  form_id uuid not null,
  values jsonb not null,
  source_ip_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  external_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (workspace_id, provider, external_id)
);

create table if not exists public.observability_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('metric', 'error', 'rejection', 'lifecycle')),
  name text not null check (char_length(name) between 1 and 120),
  value numeric not null default 0,
  detail text not null default '',
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_backups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  storage_path text not null unique,
  schema_version integer not null default 7,
  status text not null default 'complete' check (status in ('complete', 'failed')),
  item_count integer not null default 0,
  size_bytes bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create index if not exists observability_workspace_created_idx on public.observability_events(workspace_id, created_at desc);
create index if not exists workspace_backups_workspace_created_idx on public.workspace_backups(workspace_id, created_at desc);
create index if not exists work_items_board_updated_idx on public.work_items(board_id, updated_at desc);

create or replace function public.submit_public_form(p_board_id uuid, p_form_id uuid, p_values jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_submission_id uuid;
begin
  if jsonb_typeof(p_values) <> 'object' then raise exception 'Invalid form values'; end if;
  if not exists (
    select 1 from public.boards b
    join public.workspace_feature_state s on s.workspace_id = b.workspace_id
    cross join lateral jsonb_array_elements(coalesce(s.state->'forms', '[]'::jsonb)) form
    where b.id = p_board_id and form->>'id' = p_form_id::text and coalesce((form->>'published')::boolean, false)
  ) then raise exception 'Form is not published'; end if;
  insert into public.public_form_submissions (board_id, form_id, values)
  values (p_board_id, p_form_id, p_values) returning id into v_submission_id;
  return v_submission_id;
end;
$$;

create or replace function public.get_public_form(p_form_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select form || jsonb_build_object('workspace_id', s.workspace_id)
  from public.workspace_feature_state s
  cross join lateral jsonb_array_elements(coalesce(s.state->'forms', '[]'::jsonb)) form
  where form->>'id' = p_form_id::text and coalesce((form->>'published')::boolean, false)
  limit 1;
$$;

create or replace function public.create_scim_token(p_workspace_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_token text := 'mf_scim_' || encode(gen_random_bytes(24), 'hex');
begin
  if not public.can_manage_workspace(p_workspace_id) then raise exception 'Workspace admin required'; end if;
  update public.scim_tokens set revoked_at = now() where workspace_id = p_workspace_id and revoked_at is null;
  insert into public.scim_tokens (workspace_id, token_hash, token_preview)
  values (p_workspace_id, encode(digest(v_token, 'sha256'), 'hex'), left(v_token, 20) || '...');
  insert into public.organization_security (workspace_id, scim_enabled)
  values (p_workspace_id, true)
  on conflict (workspace_id) do update set scim_enabled = true, updated_at = now();
  return v_token;
end;
$$;

create or replace function public.start_workspace_trial(p_workspace_id uuid, p_plan text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_workspace(p_workspace_id) then raise exception 'Workspace admin required'; end if;
  if p_plan not in ('standard', 'pro', 'enterprise') then raise exception 'Invalid trial plan'; end if;
  insert into public.billing_accounts (workspace_id, plan, status, seats, current_period_end)
  values (p_workspace_id, p_plan, 'trial', greatest(1, (select count(*) from public.workspace_members where workspace_id = p_workspace_id and status = 'active')), now() + interval '14 days')
  on conflict (workspace_id) do update set plan = excluded.plan, status = 'trial', seats = excluded.seats, current_period_end = excluded.current_period_end, updated_at = now();
end;
$$;

create or replace function public.enqueue_due_date_automations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.automation_jobs (automation_id, board_id, item_id, status, message, payload, scheduled_for)
  select
    (recipe->>'id')::uuid,
    b.id,
    i.id,
    'queued',
    'Scheduled date automation queued',
    case recipe->>'action'
      when 'send_email' then jsonb_build_object('type','send_email','to',recipe->>'action_value','subject','MondayFlow due date: ' || i.title,'text','Item ' || i.title || ' is due today.')
      when 'call_webhook' then jsonb_build_object('type','call_webhook','endpoint',recipe->>'action_value','body',jsonb_build_object('item_id',i.id,'item_title',i.title,'status',i.status))
      else jsonb_build_object('type',recipe->>'action','value',recipe->>'action_value')
    end,
    now()
  from public.workspace_feature_state s
  cross join lateral jsonb_array_elements(coalesce(s.state->'automations','[]'::jsonb)) recipe
  join public.boards b on b.workspace_id = s.workspace_id and b.id::text = recipe->>'board_id'
  join public.work_items i on i.board_id = b.id and i.timeline_end::date <= current_date
  where recipe->>'trigger' = 'date_arrived'
    and coalesce((recipe->>'enabled')::boolean, false)
    and recipe->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and not exists (
      select 1 from public.automation_jobs j
      where j.automation_id = (recipe->>'id')::uuid and j.item_id = i.id and j.created_at::date = current_date
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.workspace_workload(p_workspace_id uuid)
returns table(user_id uuid, full_name text, assigned_count bigint, board_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Workspace access required'; end if;
  return query
  select wm.user_id, p.full_name, count(i.id) filter (where i.parent_id is null) as assigned_count, count(distinct i.board_id) filter (where i.id is not null) as board_count
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  left join public.boards b on b.workspace_id = wm.workspace_id and public.can_access_board(b.id)
  left join public.work_items i on i.board_id = b.id and lower(i.owner) = lower(split_part(p.full_name, ' ', 1))
  where wm.workspace_id = p_workspace_id and wm.status = 'active' and wm.role <> 'guest'
  group by wm.user_id, p.full_name
  order by p.full_name;
end;
$$;

create or replace function public.restore_workspace_backup(p_workspace_id uuid, p_bundle jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_workspace(p_workspace_id) then raise exception 'Workspace admin required'; end if;
  if coalesce((p_bundle->>'schema_version')::integer, 0) <> 7 then raise exception 'Unsupported backup schema'; end if;
  if coalesce(p_bundle->>'workspace_id', '') <> p_workspace_id::text then raise exception 'Backup workspace mismatch'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_bundle#>'{snapshot,items}', '[]'::jsonb)) as item(board_id uuid)
    where not exists (select 1 from public.boards b where b.id = item.board_id and b.workspace_id = p_workspace_id)
  ) then raise exception 'Backup contains a board outside this workspace'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_bundle#>'{snapshot,updates}', '[]'::jsonb)) as entry(board_id uuid, item_id uuid)
    where not exists (select 1 from public.boards b where b.id = entry.board_id and b.workspace_id = p_workspace_id)
      or (
        not exists (select 1 from public.work_items i where i.id = entry.item_id and i.board_id = entry.board_id)
        and not exists (
          select 1 from jsonb_to_recordset(coalesce(p_bundle#>'{snapshot,items}', '[]'::jsonb)) as item(id uuid, board_id uuid)
          where item.id = entry.item_id and item.board_id = entry.board_id
        )
      )
  ) then raise exception 'Backup contains an update outside this workspace'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_bundle#>'{snapshot,activity}', '[]'::jsonb)) as entry(board_id uuid, item_id uuid)
    where not exists (select 1 from public.boards b where b.id = entry.board_id and b.workspace_id = p_workspace_id)
      or (entry.item_id is not null
        and not exists (select 1 from public.work_items i where i.id = entry.item_id and i.board_id = entry.board_id)
        and not exists (
          select 1 from jsonb_to_recordset(coalesce(p_bundle#>'{snapshot,items}', '[]'::jsonb)) as item(id uuid, board_id uuid)
          where item.id = entry.item_id and item.board_id = entry.board_id
        )
      )
  ) then raise exception 'Backup contains activity outside this workspace'; end if;

  insert into public.work_items (id, board_id, title, group_name, owner, status, priority, timeline_start, timeline_end, progress, budget, description, custom_values, parent_id, sort_order)
  select id, board_id, title, group_name, owner, status, priority, timeline_start, timeline_end, progress, budget, description, coalesce(custom_values, '{}'::jsonb), null, sort_order
  from jsonb_to_recordset(coalesce(p_bundle#>'{snapshot,items}', '[]'::jsonb)) as item(id uuid, board_id uuid, title text, group_name text, owner text, status text, priority text, timeline_start date, timeline_end date, progress integer, budget numeric, description text, custom_values jsonb, parent_id uuid, sort_order integer)
  where item.parent_id is null
  on conflict (id) do update set title = excluded.title, group_name = excluded.group_name, owner = excluded.owner, status = excluded.status, priority = excluded.priority, timeline_start = excluded.timeline_start, timeline_end = excluded.timeline_end, progress = excluded.progress, budget = excluded.budget, description = excluded.description, custom_values = excluded.custom_values, sort_order = excluded.sort_order;

  insert into public.work_items (id, board_id, title, group_name, owner, status, priority, timeline_start, timeline_end, progress, budget, description, custom_values, parent_id, sort_order)
  select id, board_id, title, group_name, owner, status, priority, timeline_start, timeline_end, progress, budget, description, coalesce(custom_values, '{}'::jsonb), parent_id, sort_order
  from jsonb_to_recordset(coalesce(p_bundle#>'{snapshot,items}', '[]'::jsonb)) as item(id uuid, board_id uuid, title text, group_name text, owner text, status text, priority text, timeline_start date, timeline_end date, progress integer, budget numeric, description text, custom_values jsonb, parent_id uuid, sort_order integer)
  where item.parent_id is not null
  on conflict (id) do update set title = excluded.title, group_name = excluded.group_name, owner = excluded.owner, status = excluded.status, priority = excluded.priority, timeline_start = excluded.timeline_start, timeline_end = excluded.timeline_end, progress = excluded.progress, budget = excluded.budget, description = excluded.description, custom_values = excluded.custom_values, parent_id = excluded.parent_id, sort_order = excluded.sort_order;

  insert into public.item_updates (id, board_id, item_id, author, body, created_at)
  select id, board_id, item_id, author, body, created_at
  from jsonb_to_recordset(coalesce(p_bundle#>'{snapshot,updates}', '[]'::jsonb)) as entry(id uuid, board_id uuid, item_id uuid, author text, body text, created_at timestamptz)
  on conflict (id) do nothing;

  insert into public.activity_logs (id, board_id, item_id, action, created_at)
  select id, board_id, item_id, action, created_at
  from jsonb_to_recordset(coalesce(p_bundle#>'{snapshot,activity}', '[]'::jsonb)) as entry(id uuid, board_id uuid, item_id uuid, action text, created_at timestamptz)
  on conflict (id) do nothing;

  insert into public.workspace_feature_state (workspace_id, state, updated_by, updated_at)
  values (p_workspace_id, (p_bundle->'platform') - array['enterprise','integrations','reliability','submissions','customValues'], auth.uid(), now())
  on conflict (workspace_id) do update set state = public.workspace_feature_state.state || excluded.state, updated_by = auth.uid(), updated_at = now();
end;
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.work_items enable row level security;
alter table public.item_updates enable row level security;
alter table public.activity_logs enable row level security;
alter table public.attachments enable row level security;
alter table public.workspace_feature_state enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.integration_connections enable row level security;
alter table public.organization_security enable row level security;
alter table public.scim_tokens enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.public_form_submissions enable row level security;
alter table public.integration_webhook_events enable row level security;
alter table public.observability_events enable row level security;
alter table public.workspace_backups enable row level security;

drop policy if exists "Profiles visible to collaborators" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
create policy "Profiles visible to collaborators" on public.profiles for select to authenticated using (id = auth.uid() or public.shares_workspace(id));
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Members read workspaces" on public.workspaces;
drop policy if exists "Members create workspaces" on public.workspaces;
drop policy if exists "Managers update workspaces" on public.workspaces;
drop policy if exists "Owners delete workspaces" on public.workspaces;
create policy "Members read workspaces" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "Members create workspaces" on public.workspaces for insert to authenticated with check (created_by = auth.uid());
create policy "Managers update workspaces" on public.workspaces for update to authenticated using (public.can_manage_workspace(id));
create policy "Owners delete workspaces" on public.workspaces for delete to authenticated using (public.workspace_role(id) = 'owner');

drop policy if exists "Members read membership" on public.workspace_members;
create policy "Members read membership" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists "Members read teams" on public.teams;
drop policy if exists "Editors create teams" on public.teams;
drop policy if exists "Managers update teams" on public.teams;
drop policy if exists "Managers delete teams" on public.teams;
create policy "Members read teams" on public.teams for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Editors create teams" on public.teams for insert to authenticated with check (public.can_edit_workspace(workspace_id));
create policy "Managers update teams" on public.teams for update to authenticated using (public.can_manage_workspace(workspace_id));
create policy "Managers delete teams" on public.teams for delete to authenticated using (public.can_manage_workspace(workspace_id));

drop policy if exists "Members read team membership" on public.team_members;
drop policy if exists "Managers change team membership" on public.team_members;
create policy "Members read team membership" on public.team_members for select to authenticated using (exists (select 1 from public.teams t where t.id = team_id and public.is_workspace_member(t.workspace_id)));
create policy "Managers change team membership" on public.team_members for all to authenticated using (exists (select 1 from public.teams t where t.id = team_id and public.can_manage_workspace(t.workspace_id))) with check (exists (select 1 from public.teams t where t.id = team_id and public.can_manage_workspace(t.workspace_id)));

drop policy if exists "Members read boards" on public.boards;
drop policy if exists "Editors create boards" on public.boards;
drop policy if exists "Board managers update boards" on public.boards;
drop policy if exists "Board managers delete boards" on public.boards;
create policy "Members read boards" on public.boards for select to authenticated using (public.can_access_board(id));
create policy "Editors create boards" on public.boards for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid());
create policy "Board managers update boards" on public.boards for update to authenticated using (public.can_manage_board(id));
create policy "Board managers delete boards" on public.boards for delete to authenticated using (public.can_manage_board(id));

drop policy if exists "Board members read board membership" on public.board_members;
drop policy if exists "Board managers change board membership" on public.board_members;
create policy "Board members read board membership" on public.board_members for select to authenticated using (public.can_access_board(board_id));
create policy "Board managers change board membership" on public.board_members for all to authenticated using (public.can_manage_board(board_id)) with check (public.can_manage_board(board_id));

drop policy if exists "Managers read invitations" on public.workspace_invitations;
create policy "Managers read invitations" on public.workspace_invitations for select to authenticated using (public.can_manage_workspace(workspace_id) or lower(email) = lower(coalesce(auth.jwt()->>'email', '')));

drop policy if exists "Allow public read" on public.work_items;
drop policy if exists "Allow public inserts" on public.work_items;
drop policy if exists "Allow public updates" on public.work_items;
drop policy if exists "Allow public deletes" on public.work_items;
drop policy if exists "Users read own items" on public.work_items;
drop policy if exists "Users insert own items" on public.work_items;
drop policy if exists "Users update own items" on public.work_items;
drop policy if exists "Users delete own items" on public.work_items;
drop policy if exists "Board members read items" on public.work_items;
drop policy if exists "Board editors insert items" on public.work_items;
drop policy if exists "Board editors update items" on public.work_items;
drop policy if exists "Board editors delete items" on public.work_items;
create policy "Board members read items" on public.work_items for select to authenticated using (public.can_access_board(board_id));
create policy "Board editors insert items" on public.work_items for insert to authenticated with check (public.can_edit_board(board_id));
create policy "Board editors update items" on public.work_items for update to authenticated using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));
create policy "Board editors delete items" on public.work_items for delete to authenticated using (public.can_edit_board(board_id));

drop policy if exists "Users read own updates" on public.item_updates;
drop policy if exists "Users insert own updates" on public.item_updates;
drop policy if exists "Board members read updates" on public.item_updates;
drop policy if exists "Board editors insert updates" on public.item_updates;
create policy "Board members read updates" on public.item_updates for select to authenticated using (public.can_access_board(board_id));
create policy "Board editors insert updates" on public.item_updates for insert to authenticated with check (public.can_edit_board(board_id) and exists (select 1 from public.work_items i where i.id = item_id and i.board_id = board_id));

drop policy if exists "Users read own activity" on public.activity_logs;
drop policy if exists "Users insert own activity" on public.activity_logs;
drop policy if exists "Board members read activity" on public.activity_logs;
drop policy if exists "Board editors insert activity" on public.activity_logs;
create policy "Board members read activity" on public.activity_logs for select to authenticated using (public.can_access_board(board_id));
create policy "Board editors insert activity" on public.activity_logs for insert to authenticated with check (public.can_edit_board(board_id));

drop policy if exists "Board members read attachments" on public.attachments;
drop policy if exists "Board editors add attachments" on public.attachments;
drop policy if exists "Uploaders delete attachments" on public.attachments;
create policy "Board members read attachments" on public.attachments for select to authenticated using (public.can_access_board(board_id));
create policy "Board editors add attachments" on public.attachments for insert to authenticated with check (public.can_edit_board(board_id));
create policy "Uploaders delete attachments" on public.attachments for delete to authenticated using (uploaded_by = auth.uid() or public.can_manage_board(board_id));

drop policy if exists "Members read platform state" on public.workspace_feature_state;
drop policy if exists "Managers create platform state" on public.workspace_feature_state;
drop policy if exists "Managers update platform state" on public.workspace_feature_state;
create policy "Members read platform state" on public.workspace_feature_state for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Managers create platform state" on public.workspace_feature_state for insert to authenticated with check (public.can_manage_workspace(workspace_id) and updated_by = auth.uid());
create policy "Managers update platform state" on public.workspace_feature_state for update to authenticated using (public.can_manage_workspace(workspace_id)) with check (public.can_manage_workspace(workspace_id) and updated_by = auth.uid());

drop policy if exists "Board members read automation jobs" on public.automation_jobs;
drop policy if exists "Board editors create automation jobs" on public.automation_jobs;
create policy "Board members read automation jobs" on public.automation_jobs for select to authenticated using (public.can_access_board(board_id));
create policy "Board editors create automation jobs" on public.automation_jobs for insert to authenticated with check (public.can_edit_board(board_id));

drop policy if exists "Managers read integrations" on public.integration_connections;
drop policy if exists "Managers configure integrations" on public.integration_connections;
create policy "Managers read integrations" on public.integration_connections for select to authenticated using (public.can_manage_workspace(workspace_id));
create policy "Managers configure integrations" on public.integration_connections for all to authenticated using (public.can_manage_workspace(workspace_id)) with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Managers read organization security" on public.organization_security;
drop policy if exists "Managers configure organization security" on public.organization_security;
create policy "Managers read organization security" on public.organization_security for select to authenticated using (public.can_manage_workspace(workspace_id));
create policy "Managers configure organization security" on public.organization_security for all to authenticated using (public.can_manage_workspace(workspace_id)) with check (public.can_manage_workspace(workspace_id));

drop policy if exists "Managers read scim tokens" on public.scim_tokens;
create policy "Managers read scim tokens" on public.scim_tokens for select to authenticated using (public.can_manage_workspace(workspace_id));

drop policy if exists "Managers read billing" on public.billing_accounts;
create policy "Managers read billing" on public.billing_accounts for select to authenticated using (public.can_manage_workspace(workspace_id));

drop policy if exists "Board members read form submissions" on public.public_form_submissions;
create policy "Board members read form submissions" on public.public_form_submissions for select to authenticated using (public.can_access_board(board_id));

drop policy if exists "Managers read webhook events" on public.integration_webhook_events;
create policy "Managers read webhook events" on public.integration_webhook_events for select to authenticated using (public.can_manage_workspace(workspace_id));

drop policy if exists "Managers read observability" on public.observability_events;
drop policy if exists "Members insert observability" on public.observability_events;
create policy "Managers read observability" on public.observability_events for select to authenticated using (public.can_manage_workspace(workspace_id));
create policy "Members insert observability" on public.observability_events for insert to authenticated with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());

drop policy if exists "Managers read backups" on public.workspace_backups;
create policy "Managers read backups" on public.workspace_backups for select to authenticated using (public.can_manage_workspace(workspace_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('board-files', 'board-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-backups', 'workspace-backups', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = 104857600;

drop policy if exists "Board members download files" on storage.objects;
drop policy if exists "Board editors upload files" on storage.objects;
drop policy if exists "Board editors update files" on storage.objects;
drop policy if exists "Board editors delete files" on storage.objects;
create policy "Board members download files" on storage.objects for select to authenticated using (bucket_id = 'board-files' and public.can_access_board(((storage.foldername(name))[1])::uuid));
create policy "Board editors upload files" on storage.objects for insert to authenticated with check (bucket_id = 'board-files' and public.can_edit_board(((storage.foldername(name))[1])::uuid));
create policy "Board editors update files" on storage.objects for update to authenticated using (bucket_id = 'board-files' and public.can_edit_board(((storage.foldername(name))[1])::uuid));
create policy "Board editors delete files" on storage.objects for delete to authenticated using (bucket_id = 'board-files' and public.can_edit_board(((storage.foldername(name))[1])::uuid));

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces, public.workspace_members, public.teams, public.team_members, public.boards, public.board_members, public.workspace_invitations to authenticated;
grant select, insert, update, delete on public.work_items, public.item_updates, public.activity_logs, public.attachments to authenticated;
grant select, insert, update on public.workspace_feature_state to authenticated;
grant select, insert on public.automation_jobs to authenticated;
grant select, insert, update, delete on public.integration_connections, public.organization_security to authenticated;
grant select on public.scim_tokens, public.billing_accounts, public.integration_webhook_events to authenticated;
grant select on public.public_form_submissions to authenticated;
grant select, insert on public.observability_events to authenticated;
grant select on public.workspace_backups to authenticated;
grant execute on function public.submit_public_form(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.get_public_form(uuid) to anon, authenticated;
grant execute on function public.create_scim_token(uuid) to authenticated;
grant execute on function public.start_workspace_trial(uuid, text) to authenticated;
revoke all on function public.enqueue_due_date_automations() from public, anon, authenticated;
grant execute on function public.enqueue_due_date_automations() to service_role;
grant execute on function public.workspace_workload(uuid) to authenticated;
grant execute on function public.restore_workspace_backup(uuid, jsonb) to authenticated;
grant execute on function public.bootstrap_account() to authenticated;
grant execute on function public.create_workspace_with_owner(text) to authenticated;
grant execute on function public.create_workspace_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.set_workspace_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'work_items') then alter publication supabase_realtime add table public.work_items; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_updates') then alter publication supabase_realtime add table public.item_updates; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attachments') then alter publication supabase_realtime add table public.attachments; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_logs') then alter publication supabase_realtime add table public.activity_logs; end if;
end $$;
