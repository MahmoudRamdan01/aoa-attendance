# Air Ocean Line HR v1 - Test Cases

## Automated smoke test

Run:

```powershell
$env:SMOKE_EMPLOYEE_PASSWORD="..."
$env:SMOKE_OWNER_PASSWORD="..."
$env:SMOKE_HR_PASSWORD="..."
$env:SMOKE_ATTENDANCE_PASSWORD="..."
$env:SMOKE_MUTATE_ATTENDANCE="1"
npm run smoke:v1
```

The script writes the last result to `../../outputs/smoke-v1-results.json`.

## Covered by `npm run smoke:v1`

| Area | Case | Expected |
| --- | --- | --- |
| Auth | Employee login | Login succeeds and account resolves to an employee |
| Auth | Owner login | Login succeeds and role resolves to `owner` |
| Auth | HR login | Login succeeds and role resolves to `hr` |
| Context | Employee mapping | `get_my_context_v1` returns employee data |
| Context | Admin mapping | Owner/HR roles return correctly |
| QR | Owner gets today's QR | `get_daily_qr_v1` returns a code |
| QR | HR gets tomorrow's QR | `get_qr_for_date_v1` returns a code for the selected date |
| QR | Employee blocked from admin QR | Employee receives `hr_only` |
| Permission requests | Invalid hours | 3-hour request is rejected |
| Permission requests | Submit permission | Request returns ok |
| Permission requests | Employee visibility | Submitted permission appears in employee query |
| Permission requests | Owner visibility | Submitted permission appears in pending admin query |
| Permission requests | Decision cleanup | Owner/HR can reject the test request |
| Permission requests | Duplicate decision | A decided permission returns `already_decided` |
| Leave requests | Submit leave | Request returns ok |
| Leave requests | Employee visibility | Submitted leave appears in employee query |
| Leave requests | Owner visibility | Submitted leave appears in pending admin query using explicit employee relation |
| Leave requests | Decision cleanup | Owner/HR can reject the test request |
| Leave requests | Duplicate decision | A decided leave returns `already_decided` |
| Notifications | Owner sends team message | Message is created for active team members |
| Notifications | Employee receives message | Team message appears for employee |
| Notifications | Mark read | `read_at` is set |
| Notifications | Mark all read | All employee notifications are marked read |
| Notifications | Owner delete for all | Notification is hidden after soft delete |
| Notifications | HR sends individual message | Only one recipient is created |
| Attendance | Missing checkout review | First review processes one missing checkout |
| Attendance | Missing checkout idempotency | Second review for the same attendance record processes zero records |
| Attendance | Bad QR | Wrong QR is rejected before inserting attendance |
| Attendance | First late | First late over 15 minutes creates warning without deduction |
| Attendance | Repeated late | Existing monthly warning makes next late deduct 0.25 day |
| Attendance | Reset rollback | Owner reset removes the smoke attendance and rolls back late counters |

## Manual UI cases before release

| Area | Case | Expected |
| --- | --- | --- |
| Login screen | Wrong password | Arabic error message appears without leaking details |
| Login screen | Employee login | Employee lands on personal page only |
| Login screen | Owner login | Owner sees admin and owner dashboards |
| Today page | Browser denies location | Clear location permission message appears |
| Today page | Outside company radius | Registration is blocked with distance |
| Today page | Correct QR and location | Check-in is saved once |
| Today page | Second check-in same day | Button is disabled or API returns already registered |
| Today page | Check-out before check-in | API blocks check-out |
| Today page | Offline save | Action is queued locally when network fails |
| Today page | Offline sync | Queued action syncs after network returns |
| Requests page | Permission submit | Toast appears and "my requests" refreshes immediately |
| Requests page | Leave submit | Toast appears and "my requests" refreshes immediately |
| Admin dashboard | Pending permission | Request appears under pending permissions |
| Admin dashboard | Pending leave | Request appears under pending leaves |
| Admin dashboard | Approve permission 1 hour | Employee notification shows approved 1 hour |
| Admin dashboard | Approve permission 2 hours | Employee notification shows approved 2 hours |
| Admin dashboard | Reject permission | Employee notification shows rejection |
| Admin dashboard | Approve leave | Leave balance decreases and attendance is marked leave |
| Admin dashboard | Reject leave | Leave balance is unchanged |
| Admin dashboard | Official holiday range | Selected days are saved as holidays |
| Admin dashboard | QR panel | Today and tomorrow codes are visible to HR/Owner |
| Admin dashboard | QR visual | QR image renders and code can be copied/printed |
| Admin dashboard | Reset attendance | Owner can remove a wrong daily record |
| Admin dashboard | Filters | Name search and status filter keep table readable |
| Notifications | Admin compose team | Team message appears for team members |
| Notifications | Admin compose one employee | Message appears only for selected employee |
| Notifications | Mark as read | Unread count decreases |
| Notifications | Mark all read | Unread count goes to zero for current user |
| Notifications | Owner delete for all | Deleted message disappears for all recipients |
| Owner dashboard | Day/week/month switch | Metrics update for selected period |
| Owner dashboard | HR salary privacy | HR does not see salary amounts |
| Owner dashboard | Owner salary visibility | Owner sees deduction estimates |
| Owner dashboard | CSV export | CSV file contains date, employee, status, times, late minutes, and deduction days |
| Account management | Role linking | Owner can link employee accounts as Employee/HR/Owner |
| Account management | Admin role sync | HR/Owner roles update `app_admins` as well as `employee_accounts` |
| Mobile | Main navigation | No text overlaps and all controls are tappable |
| Mobile | Forms | Inputs, selects, and buttons fit the viewport |
| Security | Employee direct table access | Employee sees only their records |
| Security | HR delete notification | HR cannot delete notification for all |
| Security | Owner delete notification | Owner can soft-delete notification groups |
