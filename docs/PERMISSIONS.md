# Permission Matrix

## Workspace roles

| Action | Owner | Admin | Member | Viewer | Guest |
| --- | ---: | ---: | ---: | ---: | ---: |
| View workspace and Main boards | Yes | Yes | Yes | Yes | No |
| Edit Main board items | Yes | Yes | Yes | No | No |
| Create boards and teams | Yes | Yes | Yes | No | No |
| Manage workspace settings | Yes | Yes | No | No | No |
| Invite or remove members | Yes | Yes | No | No | No |
| Change member roles | Yes | Yes | No | No | No |
| Delete workspace | Yes | No | No | No | No |
| Access private board | Yes | Yes | If invited | If invited | No |
| Access shareable board | Yes | Yes | If invited | If invited | If invited |
| Edit private/shareable board | Yes | Yes | Board editor | No | Board editor |
| Manage columns, templates, and automations | Yes | Yes | No | No | No |
| Configure integrations | Yes | Yes | No | No | No |
| Manage SSO, SCIM, retention, and billing | Yes | Yes | No | No | No |
| Read telemetry and backup history | Yes | Yes | No | No | No |
| Create or restore cloud backup | Yes | Yes | No | No | No |
| Read public form responses on accessible board | Yes | Yes | Yes | Yes | If board invited |

## Board roles

| Role | Read | Edit items | Change board settings | Manage board members |
| --- | ---: | ---: | ---: | ---: |
| Owner | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | No | No |
| Viewer | Yes | No | No | No |

Workspace owner/admin access is always evaluated in addition to board membership.

## Enforcement

The UI uses these permissions to hide or disable commands, but the database remains authoritative. Every protected table and Storage policy calls security-definer helper functions that evaluate membership without recursive RLS queries.

Invitation creation, acceptance, workspace creation, and membership changes use explicit database functions so multi-table changes occur atomically.

Public callers never receive workspace state. Security-definer RPCs expose only published form definitions and accept only response values. Automation workers, backup workers, SCIM, provider webhooks, and billing webhooks use server credentials and are not callable through the browser role. Restore explicitly excludes membership, identity, billing, security settings, provider secrets, and file bytes.
