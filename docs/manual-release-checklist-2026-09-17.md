# Manual release checklist

Use https://www.psx-tracker.com. Reload the app on both devices first. Use a separate test account and a portfolio named `Release Test` for sample trades, password changes and deletion tests. Keep your real portfolios out of those tests.

Already confirmed: recovery email delivery, phone-to-web recovery after Load latest, public-page availability, expected rejection of invalid symbols and anonymous protected requests. These do not need repeating as standalone tests.

Record each remaining check as PASS, FAIL or NOT TESTED. An automated test pass is not a substitute for the device checks below.

## 1. Google sign-in and password setup

- [ ] In a fresh browser profile, use a Google test account that has not used the app before. Complete the normal access-request/approval step if shown.
- [ ] Confirm **Add another way to log in** appears. Select **Maybe later** and confirm the app remains usable.
- [ ] Open **Settings → Profile & Security → Email me a password setup link**. Follow the email link and set a password of at least 10 characters.
- [ ] Sign out. In a separate private window, log in with that same email and the new password. Then test Google sign-in again.

Pass after remembered-Drive activation: both methods reach the same account/access plan and Drive portfolio, without changing the Google password. Password login in a private window must load the existing Drive records automatically. Legacy accounts may need one Google authorization to establish remembered permission. See [activation steps](remembered-drive-activation-2026-09-17.md); this additional fix is not yet verified live.

## 2. Change/reset passwords

- [ ] In **Profile & Security**, submit a wrong current password and a valid new one. It must reject the change and preserve the session.
- [ ] Submit the correct current password with matching new passwords. Sign out, confirm the old password fails and the new one works.
- [ ] From **Login → Forgot password**, request a reset for the test account. Follow the email, save a new password, sign out and verify the new login.
- [ ] Open the already-used email link in a fresh private window with no existing session. It must not authorize another reset. Test an expired link the same way after its configured expiry; request a fresh link afterward.

Pass: valid links work, wrong/mismatched inputs fail clearly, and used/expired links do not grant a new session. Email delivery alone does not prove this complete flow.

## 3. Account separation and reconnecting

- [ ] Save a distinctive dummy transaction in test account A and wait for **Synced**. Sign out and choose a different Google test account B in the same browser.
- [ ] Check Transactions, Holdings and Watchlist. A's data must not appear under B. Return to A and load its data again.
- [ ] Leave a password session with remembered Drive access idle for roughly an hour, then load/save a test change. Drive access should renew without a Google popup. Separately revoke a test grant in Google permissions and verify the app explains how to reauthorize while preserving local records.

Pass: no cross-account records, no wrong-account writes, no endless sign-in/spinner loop and no loss on reconnect. A brief delay before token expiry is detected is not itself a failure.

## 4. Two devices and an empty portfolio

- [ ] On the phone, add a dummy trade to Release Test and wait for **Synced**. On desktop choose **Load latest**. Edit the dummy trade there, wait for Synced, then Load latest on the phone.
- [ ] For the conflict case, open the same baseline on both devices, disconnect desktop internet, edit a dummy trade there, then make/save a different change on the phone. Reconnect desktop. If it reports a newer cloud copy, choose **Download local copy**, then **Load latest**.
- [ ] Check that the downloaded file contains the desktop edit and the loaded app shows the phone's newer data. This chooses the cloud copy; it does not automatically merge both edits.
- [ ] Delete only the dummy transactions in Release Test, wait for Synced and reload both devices. The test portfolio must remain empty, with other portfolios unchanged.

Pass: saves work both ways, conflicts never silently overwrite the newer copy, and removed test transactions do not reappear.

## 5. Offline startup and return online

- [ ] Open the installed app while online and confirm the test data is loaded. Switch the phone to airplane mode, close and reopen the installed app.
- [ ] Confirm saved transactions are available in the read-only recovery view. It must not claim prices are live or changes are synced.
- [ ] Reconnect, reload and sign in again if prompted. Confirm normal access and the latest saved data return.

Pass: useful offline recovery, no endless spinner, no misleading successful-sync message and no lost records.

## 6. Actual mobile usability

- [ ] On iPhone Safari, check landing/login: Get Started is below the phone's status area and remains tappable; keyboard-open forms still allow submission.
- [ ] Open a stock profile with long financial tables. Scroll the table sideways, then scroll the page vertically. Columns/actions must remain reachable without pushing the entire page sideways.
- [ ] On Charts and the stock-profile chart, try vertical page scrolling over the chart and horizontal chart panning. Turn on drawing mode, select/move a horizontal line, then leave drawing mode and scroll again.
- [ ] Repeat in light/dark mode and portrait/landscape. Check the menu/footer, logo, tagline and app icon.
- [ ] Repeat the key checks in the iPhone Home Screen app and Android Chrome when available; otherwise record Android as NOT TESTED.

Pass: no controls behind phone bars/keyboard, trapped vertical scrolling, clipped tables or unreadable colors. Check actual phones; desktop viewport emulation is not sufficient evidence.

## 7. Imports and exports

- [ ] In Release Test, open the transaction form's **Import → Download Import Template (CSV)**. Make two small dummy trades in the template, upload it, choose **Process Import**, review and save.
- [ ] In Transactions, export CSV or Excel and compare ticker, date, quantity, price and fees against the two source rows.
- [ ] If mutual-fund import is offered, use a non-sensitive sample in a separate test fund portfolio. Open its fund profile, including a fund without an exact catalog match.

Pass: correct values/counts, readable export, no blank screen or crashes. Respect the test account's plan limits when checking import/export.

## 8. Admin and access approvals

- [ ] Sign in as the owner and open **Settings → Users**. Unlock with the separate value saved as `ADMIN_SECRET` in Vercel. The previous hint naming `APPROVE_SECRET` was outdated and has been corrected in source.
- [ ] Confirm the user list loads. Approve only your test account, then sign in as that account and verify its access. Try the Manage controls only on test accounts and record whether the displayed plan and actual access agree.
- [ ] For a fresh approval email, opening its link should first show confirmation. Confirm once; reopening the used link must not apply approval again. Test expired approval links separately if available.
- [ ] Sign in as an ordinary test user: the owner Users section must not be available.

Pass: valid admin credentials work, normal users lack admin access, and approval is deliberate and single-use. Do not disable/remove the owner or change a real customer's plan for testing.

## 9. Real price-alert delivery

- [ ] On iPhone, add the site to the Home Screen, launch that installed app, and allow notifications. Home Screen web push requires iOS 16.4 or later. [WebKit documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- [ ] In **Price Alerts**, choose a valid stock with a current quote. Add one test **Rises to / ABOVE** target below the displayed price so the condition is already satisfied, then activate it. Verify it appears under Your Active Alerts.
- [ ] Wait for a successful scheduled check. The repository requests checks every five minutes during 04:00–11:59 UTC on weekdays (09:00–16:59 Pakistan time), but scheduler execution can be delayed. For a controlled run, use GitHub → PSX45 → Actions → Frequent Price Check → Run workflow. This evaluates ALL currently eligible alerts and may notify other users; use the normal schedule if a manual run is inappropriate.
- [ ] Confirm the test notification arrives with the correct ticker/price. Wait for another successful run and verify the same one-shot alert does not notify repeatedly. Remove any remaining test alert and reload to confirm removal persists.

Pass: saving an alert AND receiving the push both work. These are browser/app notifications, not Brevo emails. If it fails, record device, ticker, creation time and workflow result; do not expose scheduler secrets.

## 10. Google public access

- [ ] In Google Cloud, select the project containing the app's Google client. Open **Google Auth Platform → Audience** and confirm the public launch audience/publishing status is appropriate rather than limited to a test-user list.
- [ ] Under **Branding**, check the name, support email, domain, homepage, privacy and terms URLs. Under **Data Access / Verification Center**, check the status of each requested scope, including optional Gmail import.
- [ ] Have a consenting external tester who is not on the OAuth test-user list try Google sign-in and Drive connection. Record any access-blocked or unverified-app screen; do not tell users to bypass it as the release solution.

Pass: the intended public users can authorize the app, and required brand/scope verification is complete. Publishing and verification are separate statuses. [Google production-readiness guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

## 11. Existing accounts and public pages

- [ ] Review Supabase **Authentication → Users** for email accounts created before email confirmation was enabled. A pre-existing confirmed flag does not prove inbox ownership. Record which accounts have independent ownership evidence; arrange email ownership verification for uncertain accounts rather than assuming they are verified. Do not bulk-delete users.
- [ ] Read About, Privacy and Terms against the real business: operator name, support contacts, prices/trial, refunds, data retention and deletion process. Have applicable legal requirements reviewed before broad launch.
- [ ] On Contact, tap email and WhatsApp and verify the intended recipient. Test Suggestions while signed out and signed in: private access is required; preparing a message should not claim it was sent automatically.
- [ ] Assign who reads support/deletion requests and how they are handled.

Pass: accurate public promises, reachable support, and a documented legacy-account review. Public pages loading successfully is already checked; this step is about their accuracy and workflows.

## 12. Hosting and operational checks

- [ ] In Vercel, select the team → **Usage → Deployment Storage → Functions Storage**, then compare project usage. The earlier observation was 19.51 GB against a displayed 10 GB allowance; read the current figure before deciding what to change.
- [ ] Review the project's deployment retention and function bundle sizes. Resolve the warning within your chosen plan, preserving the current deployment and a usable rollback. This checklist does not require purchasing an upgrade. [Vercel storage guide](https://vercel.com/docs/deployment-storage).
- [ ] After the above tests, inspect Vercel logs for repeated 500/503 errors or timeouts, GitHub Frequent Price Check for successful runs, and Brevo for delivery failures.
- [ ] Confirm the release-validation workflow passes for the current commit and arrange a required check on the production branch where available. Assign someone to monitor errors and support during the first beta.

Pass: the capacity issue is understood/resolved, scheduled checks run, release validation is green and monitoring has an owner. Deliberate 400/401 tests are expected; repeated errors during valid signed-in actions need investigation.

## Result record

Copy one line per check:

`Check number — PASS / FAIL / NOT TESTED — device/browser — time — result/error`

For a failure, include a screenshot without passwords, keys or reset/approval links. Keep broad public launch on hold for data loss, account mixing, broken login/reset, failed alert delivery, blocked Google access or unresolved hosting capacity. A missing Android device is NOT TESTED, not PASS.
