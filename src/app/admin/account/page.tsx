import QRCode from "qrcode";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PageHeader } from "@/components/admin";
import { SimpleForm } from "@/components/SimpleForm";
import { changePassword, disableTotp } from "@/lib/server/actions/account";
import { otpauthUrl } from "@/lib/server/totp";
import { openSecret } from "@/lib/server/secret-box";
import { fmtDate } from "@/lib/dates";
import { TotpSetup } from "./TotpSetup";
import { ResendVerification } from "./ResendVerification";

export const metadata = { title: "My account" };

export default async function Account() {
  const s = await requireAdmin("MANAGER", { allowLocked: true });
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId } });
  const pendingSecret = !user.totpEnabledAt && user.totpSecret ? openSecret(user.totpSecret) : null;
  const qr = pendingSecret && user.email ? await QRCode.toDataURL(otpauthUrl(pendingSecret, user.email), { margin: 1, width: 360 }) : null;
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="My account" sub={`${user.name} · ${user.role.toLowerCase()}`} />
      <div className="card">
        <h2 className="mb-1 font-semibold">Email</h2>
        <p className="text-sm text-slate-600">
          {user.email}{" "}
          {user.emailVerifiedAt
            ? <span className="badge ml-1 bg-emerald-100 text-emerald-800">Confirmed {fmtDate(user.emailVerifiedAt)}</span>
            : <span className="badge ml-1 bg-amber-100 text-amber-800">Not confirmed</span>}
        </p>
        {!user.emailVerifiedAt && <div className="mt-3"><ResendVerification /></div>}
      </div>
      <div className="card">
        <h2 className="mb-1 font-semibold">Two-step sign-in</h2>
        <p className="mb-4 text-sm text-slate-600">Ask for a code from your phone as well as your password when you sign in to the back office. Strongly recommended for owners.</p>
        {user.totpEnabledAt ? (
          <div className="space-y-3">
            <p className="text-sm"><span className="badge bg-emerald-100 text-emerald-800">On</span> since {fmtDate(user.totpEnabledAt)}</p>
            <SimpleForm action={disableTotp} submit="Turn off two-step sign-in" className="flex flex-wrap items-start gap-2 [&>button]:w-auto [&>button]:py-2">
              <input name="password" type="password" className="input w-56" placeholder="Your password" autoComplete="current-password" required aria-label="Your password" />
            </SimpleForm>
          </div>
        ) : <TotpSetup qr={qr} secret={pendingSecret} />}
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold">Change password</h2>
        <SimpleForm action={changePassword} submit="Change password" className="grid gap-3 sm:grid-cols-3 [&>button]:sm:col-span-3 [&>button]:sm:w-auto [&>p]:sm:col-span-3">
          <div><label className="label">Current password</label><input name="current" type="password" className="input" autoComplete="current-password" required /></div>
          <div><label className="label">New password</label><input name="password" type="password" minLength={8} className="input" autoComplete="new-password" required /></div>
          <div><label className="label">Type it again</label><input name="confirm" type="password" minLength={8} className="input" autoComplete="new-password" required /></div>
        </SimpleForm>
      </div>
    </div>
  );
}
