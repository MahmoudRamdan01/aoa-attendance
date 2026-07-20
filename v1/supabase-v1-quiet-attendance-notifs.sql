-- =====================================================================
-- Quiet the noisy attendance-security notifications
-- ---------------------------------------------------------------------
-- Owner feedback: «تسجيل من جهاز جديد» و«مؤشرات غير معتادة … flat_accuracy»
-- were firing daily for almost every employee even though they check in from
-- their usual phones. Two problems:
--   1) flat_accuracy (all GPS samples share one accuracy value) is a false
--      positive — many phones report a constant accuracy. Removed the check.
--   2) The «new device» + «unusual indicators» admin notifications are pure
--      noise for a small trusted team (device_id resets when the link is
--      opened in an in-app browser, so every check-in looks like a new
--      device). Silenced both, in the check-in AND check-out paths.
-- Kept intact: the blocking behaviour + «محاولة تسجيل مشبوهة», face-mismatch
-- alerts, the employee's own confirmation, late/early-exit notifications, and
-- all risk flags/scores still recorded on the attendance row for audit.
--
-- The edits are applied to the LIVE function source via regexp_replace, so
-- there is no hand transcription of the 300-line body. Applied live
-- 2026-07-20. Idempotent: re-running is a no-op once the strings are gone.
-- =====================================================================

do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('employee_attendance_action_v2'::regproc);

  -- 1) drop the flat_accuracy risk check
  v_def := regexp_replace(v_def,
    $p1$if v_n >= 3 and v_distinct_acc = 1 and v_distinct_coords > 1 then\s+v_medium := v_medium \+ 20;\s+v_flags := v_flags \|\| to_jsonb\('flat_accuracy'::text\);\s+end if;$p1$,
    '', 'g');

  -- 2) silence «تسجيل من جهاز جديد» (both check-in and check-out paths);
  --    the trusted_devices upsert right before it is preserved.
  v_def := regexp_replace(v_def,
    $p2$insert into notifications\(user_id,target_role,title,body,category,priority,group_id\)\s+select user_id, 'owner', 'تسجيل من جهاز جديد',[^;]*from app_admins where role = 'owner';$p2$,
    '', 'g');

  -- 3) silence «مؤشرات غير معتادة في تسجيل حضور/انصراف» (both paths)
  v_def := regexp_replace(v_def,
    $p3$if jsonb_array_length\(v_flags\) > 0 and v_risk > 0 and not v_is_new_device then\s+perform notify_admins\('مؤشرات غير معتادة[^;]*;\s+end if;$p3$,
    '', 'g');

  execute v_def;
end $mig$;
