# Personal data map

How personal data moves through MatrixPOS: where it comes in, where it is stored, who else receives it, and how it is removed. Last audited 28 November 2026. Update this file when you add a field, an integration or a log line that touches personal data.

MatrixPOS has two roles under UK GDPR:

- **Controller** for the people who sign up and run the back office (owners and managers) and for its own billing to shops.
- **Processor** for what each shop enters: its staff, its loyalty customers and its sales. The shop is the controller for that data.

## 1. Where data comes in

| Where | Data | Who it is about | Goes to |
|---|---|---|---|
| Sign up (`/signup`, `actions/auth.ts` `signup`) | Business name, shop name, postcode, owner name, email, password, till PIN, VAT number | Owner | `Organization`, `Store`, `User` (password and PIN as bcrypt hashes). Email sent with a verification link. IP used for rate limiting (hashed). |
| Sign in (`/login`, `login`, `verifyLoginCode`) | Email, password, 6-digit code, IP address | Owners, managers | Compared against hashes; attempt stored in `LoginAttempt` as a keyed hash of email and IP, deleted after 24 hours |
| Forgotten / reset password | Email, new password, IP | Owners, managers | Reset link by email (token stored only as a SHA-256 hash, 1 hour, one use). New password hashed. |
| My account (`/admin/account`) | New password, authenticator secret, codes | Owners, managers | `User.passwordHash` (bcrypt), `User.totpSecret` (AES-256-GCM encrypted when `SECRETS_ENCRYPTION_KEY` is set) |
| Staff (`/admin/staff`, `saveStaff`) | Name, email, role, PIN, password | Shop staff | `User`, `UserStore` |
| Till PIN sign-in (`/api/till/pin`) | PIN | Staff | Compared with hashes; signed cookie with ids and role only |
| Customers (`/admin/customers`, `saveCustomer`) | Name, email, phone, loyalty code, marketing consent | Shop's customers | `Customer` |
| Till loyalty lookup (`/api/till/customers`) | Search text (code, phone, email or name) | Shop's customers | Query only; returns id, name, loyalty code, points |
| Till sales (`/api/till/sales`) | Basket, payments, cashier id, customer id, card reference (provider id or last 4) | Staff, customers | `Sale`, `SaleLine`, `Payment`, `SaleVat`, journals |
| Suppliers and bills | Contact name, email, phone, account number | Suppliers' staff | `Supplier`, `Bill` |
| Stores, business settings | Shop address and phone, VAT and company number | Business (may name a sole trader) | `Store`, `Organization` |
| Card checkout for the subscription | Billing address, card, tax id | Owner | Entered on Stripe's own page, never reaches MatrixPOS. Stripe sends back name, email, address and tax id on invoices (`SubscriptionInvoice`). |

Not collected anywhere: dates of birth (age checks store only "age verified: yes"), full card numbers, device fingerprints or user agents, analytics or tracking data.

## 2. Where it is stored

| Store | What | Protection |
|---|---|---|
| Postgres (self-hosted Supabase on a LightNode VPS in London), via Prisma on the server | Everything above | Row level security on, Supabase `anon`/`authenticated` roles revoked. Passwords and PINs bcrypt. Reset/verify tokens SHA-256. Card provider keys and TOTP secrets AES-256-GCM. Rate-limit keys HMAC-SHA-256. |
| Cookies `mpos_admin`, `mpos_device`, `mpos_till`, `mpos_mfa` | Signed JWTs with ids, role and session version only. No names or emails. | `httpOnly`, `sameSite=lax`, `secure` in production, `path=/` |
| Till browser (IndexedDB, `idb-keyval`) | Product list, shop details, signed-in cashier's id, name and role, and unsent sales | Unsent sales hold only ids, no customer or cashier names. Removed once synced. |
| `localStorage` / `sessionStorage` | Nothing | Checked by `tests/privacy.test.ts` |
| Service worker cache | `/till` page, static assets | API responses are never cached |
| Server logs (Vercel) | Errors only, passed through `safeError()` | Keys, tokens, passwords, emails and UK mobile numbers replaced with `[REDACTED]` |

## 3. Who else receives it

| Service | Used for | Data sent | Not sent |
|---|---|---|---|
| Stripe Billing (MatrixPOS's account) | Shops paying their subscription by card | Business name, owner email, organisation id (metadata), plan | Staff, customers, sales |
| Stripe Terminal / SumUp / Dojo (the shop's own account) | Card payments at the till | Amount, currency, sale id (as reference), reader id | Customer name, basket, staff |
| Resend or SMTP mailbox | Verification, password reset, password changed, account closing, invoices | Recipient email, name in the greeting, the link or invoice details | Anything else |
| LightNode (London VPS running self-hosted Supabase) | Database hosting and backups | Everything in section 2 | |
| Vercel | Hosting, logs | Requests (with IP addresses, held by Vercel), redacted error logs | |

No analytics, error tracking, advertising or AI services are used. No web fonts are loaded (system fonts only) and two-step QR codes are drawn on the server, so nothing goes to font or QR services.

## 4. How it is removed

| Who | How | What happens |
|---|---|---|
| Shop customer | Back office, Customers, Erase | Name, email, phone, loyalty code and consent cleared. Sales stay without the person (needed for the shop's VAT records). |
| Staff member | Back office, Staff, open the person, "Erase this person's personal data" | Name becomes "Former staff member"; email, password, PIN, two-step secret, sign-in links and store links removed; their name is scrubbed from audit log details; switched off and signed out. Sales and shifts stay. Managers can erase cashiers and supervisors; only an owner can erase a manager or owner. |
| Whole business | Owner, Plan & billing, Close account | Tills and back office off at once, card subscription cancelled. After 30 days everything the shop entered is permanently deleted (as the DPA promises; shops download their data first to keep their own 6-year records). MatrixPOS's own invoices to the shop are kept, unlinked and without the email address, and deleted after 7 years. |
| Sign-in records | Automatic, daily cron | `LoginAttempt` older than 24 hours and used/expired tokens deleted |

## 5. Fixed in this audit

1. **Logs.** `redact()` now also masks email addresses, UK mobile numbers and `token=`/`code=`/`pin=`/`password=` values, so SMTP, Resend and Stripe errors that echo a recipient no longer log it. The email fallback logger no longer prints the recipient, and on preview deploys (`EMAIL_LOG=1`) prints the email with links and personal data masked. The daily cron no longer returns names of deleted businesses. Audit log entries now record staff by id instead of name.
2. **Rate limiting.** `LoginAttempt.key` stored email and IP addresses in plain text. It now stores an HMAC (keyed with `AUTH_SECRET`).
3. **Passwords.** bcrypt cost raised from 10 to 12 for passwords (PINs stay at 10 so the till stays fast; old hashes still work). Passwords over 72 bytes are refused, because bcrypt silently ignores the rest.
4. **Two-step secrets** are encrypted at rest with the same AES-256-GCM key as card provider keys. Existing ones are encrypted on the next production deploy by `scripts/encrypt-secrets.mjs`.
5. **Cookies.** Names were inside the signed (readable) session cookies. They now hold ids and role only.
6. **Browser storage.** Unsent till sales kept the loyalty customer's and cashier's names in IndexedDB. Those display-only fields are now dropped before storing.
7. **API responses.** The till's receipt lookup returned the whole sale with cashier, customer id, payments and references; it now returns only what the refund screen shows. Opening a shift returns only id, time and float. Override approval returns only the approver's name. Export CSVs are `no-store`.
8. **Deletion.** Added staff erasure. Deleting a closed business used to delete MatrixPOS's own subscription invoices too (needed for 6 years); they are now kept and anonymised.
9. **Privacy policy** now lists Stripe and what the email provider receives, says the database is self-hosted Supabase on the London LightNode server, and describes the hashed sign-in records and invoice retention.

## 6. Checked and already fine

- Passwords and PINs are only ever hashed with bcrypt, never logged, returned or sent anywhere. Reset and verification tokens are stored as SHA-256 hashes.
- Back office pages render on the server, so password hashes, PIN hashes and TOTP secrets never reach the browser. The staff page passes only names, emails and roles into its forms.
- Every query is scoped to the signed-in business (`organizationId`), so no endpoint returns another shop's data.
- The full data export (`/api/admin/export-all`) is owner only, leaves out password and PIN hashes and TOTP secrets, and shows card provider keys as "(set)".
- Card numbers never touch MatrixPOS: readers talk to the provider, and only the provider's transaction id or last 4 digits are stored.

## 7. Open points for the owner

- Card payment references (`Payment.reference`) can hold the last 4 card digits keyed by the cashier. That is not sensitive card data under PCI DSS, but avoid asking cashiers to type anything more.
- Shop customers have no self-service deletion; requests go to the shop, which erases them in the back office. That matches the processor role.
