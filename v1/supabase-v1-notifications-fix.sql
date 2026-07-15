-- ============================================================================
-- AOA v1 — notifications: fix owner "mark all read" leaving items visible
-- (2026-07-15)
-- Cause: notify_admins fans out ONE row per owner (each with that owner's
-- user_id AND target_role='owner'). The old SELECT policy matched any
-- target_role='owner' row regardless of user_id, so every owner saw every
-- OTHER owner's copy. mark_all_notifications_read_v1 only updates
-- user_id=auth.uid(), so those other-owner copies could never be cleared and
-- stayed visible/unread. All notifications are per-user (0 rows with null
-- user_id), so restricting the role clauses to user_id IS NULL makes the
-- visible set equal the clearable set.
-- ============================================================================
drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications for select to authenticated
using (
  deleted_at is null and (
    user_id = auth.uid()
    or (user_id is null and target_role = 'admin' and is_hr())
    or (user_id is null and target_role = 'hr' and is_hr())
    or (user_id is null and target_role = 'owner' and is_owner())
  )
);
