# Database Contract

## Client operations

| Operation | Database surface | Result |
| --- | --- | --- |
| Bootstrap account | `bootstrap_account()` | Ensures profile, first workspace, membership, and first board |
| Create workspace | `create_workspace_with_owner(name)` | Creates workspace, owner membership, and starter board atomically |
| Invite member | `create_workspace_invitation(workspace_id, email, role)` | Returns expiring invitation token |
| Accept invitation | `accept_workspace_invitation(token)` | Adds signed-in user to the invited workspace |
| Update member role | `set_workspace_member_role(workspace_id, user_id, role)` | Applies role after owner/admin check |
| Remove member | `remove_workspace_member(workspace_id, user_id)` | Removes non-owner membership |
| Load board | Filtered table queries | Returns items, updates, files, and activity for one board |
| Upload file | Private `board-files` bucket | Stores bytes at `board-id/item-id/file-id-name` |
| Load/save platform | `workspace_feature_state` | Versioned configuration for phases 2-7 |
| Submit public form | `get_public_form()`, `submit_public_form()` | Published schema read and anonymous response write |
| Queue automation | `automation_jobs` | Durable scheduled/email/webhook action queue |
| Schedule due work | `enqueue_due_date_automations()` | Idempotent daily item jobs |
| Create SCIM token | `create_scim_token()` | Returns token once and stores its SHA-256 hash |
| Start trial | `start_workspace_trial()` | Creates an authorized 14-day workspace trial |
| Record telemetry | `observability_events` | Stores technical metrics without board content |
| List backups | `workspace_backups` | Returns owner/admin-visible backup metadata |
| Restore backup | `restore_workspace_backup()` | Validates workspace and performs non-destructive data upsert |

## Realtime contract

The client subscribes to changes for `work_items`, `item_updates`, `attachments`, and `activity_logs`, filtered by the active board ID where supported. Realtime events invalidate the active board snapshot; they do not bypass RLS.

## Error contract

Database functions raise stable, user-safe messages for invalid membership, insufficient permission, expired invitations, email mismatch, owner-protection rules, and invalid backup scope. Network errors on supported mutations are placed in IndexedDB and replayed in creation order; authorization or validation failures are never treated as offline success.

Provider tokens, service-role keys, Stripe secrets, and email credentials are never part of this client contract. They belong to Edge Function environment secrets or a dedicated token vault.
