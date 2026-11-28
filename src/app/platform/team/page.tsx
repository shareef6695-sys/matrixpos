import { db } from "@/lib/server/db";
import { requireHq } from "@/lib/server/hq";
import { PageHeader } from "@/components/admin";
import { ActionForm } from "@/components/FormMessage";
import { inviteHqStaff, updateHqStaff } from "@/lib/server/actions/hq-team";
import { ROLE_LABEL, STAFF_ROLES } from "@/lib/hq/roles";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "HQ staff" };

export default async function Team() {
  await requireHq("team.manage");
  const members = await db.hqMember.findMany({ include: { user: { select: { name: true, email: true, active: true, emailVerifiedAt: true, totpEnabledAt: true } } }, orderBy: { createdAt: "asc" } });
  return (
    <div>
      <PageHeader title="HQ staff" sub="People who help run Matrix Infotech. Each person has their own login and sees only what their role allows. HQ staff can't open your shop or any customer's shop." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Added</th><th /></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={m.user.active ? "" : "opacity-60"}>
                  <td><b>{m.user.name}</b><div className="text-xs text-slate-500">{m.user.email}</div></td>
                  <td>
                    <form action={updateHqStaff} className="flex gap-1">
                      <input type="hidden" name="id" value={m.id} /><input type="hidden" name="op" value="role" />
                      <select name="role" className="input py-1 text-xs" defaultValue={m.role}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r].name}</option>)}</select>
                      <button className="btn-secondary px-2 py-1 text-xs">Set</button>
                    </form>
                  </td>
                  <td className="text-xs">{!m.user.active ? "Switched off" : m.user.emailVerifiedAt ? <>Active{m.user.totpEnabledAt ? " · two-step on" : ""}</> : "Invite not accepted yet"}</td>
                  <td className="text-xs">{fmtDate(m.createdAt)}</td>
                  <td className="space-x-2 whitespace-nowrap text-xs">
                    {m.user.active && !m.user.emailVerifiedAt && (
                      <form action={updateHqStaff} className="inline"><input type="hidden" name="id" value={m.id} /><input type="hidden" name="op" value="resend" /><button className="font-semibold text-violet-700">Resend invite</button></form>
                    )}
                    <form action={updateHqStaff} className="inline"><input type="hidden" name="id" value={m.id} /><input type="hidden" name="op" value={m.user.active ? "disable" : "enable"} /><button className={m.user.active ? "text-red-600" : "font-semibold text-emerald-700"}>{m.user.active ? "Switch off" : "Switch on"}</button></form>
                  </td>
                </tr>
              ))}
              {!members.length && <tr><td colSpan={5} className="text-center text-slate-500">No HQ staff yet. Only you can use HQ.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="space-y-6">
          <div className="card h-fit">
            <h2 className="mb-3 font-semibold">Invite someone</h2>
            <ActionForm action={inviteHqStaff} className="space-y-2" submit="Send invite" reset>
              <input name="name" className="input" placeholder="Name" required />
              <input name="email" type="email" className="input" placeholder="Work email" required />
              <select name="role" className="input" defaultValue="SALES">{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r].name}</option>)}</select>
              <p className="text-xs text-slate-500">They get an email to choose a password. The link works for 2 days.</p>
            </ActionForm>
          </div>
          <div className="card h-fit text-sm">
            <h2 className="mb-2 font-semibold">What each role can do</h2>
            <dl className="space-y-2">
              {(["OWNER", ...STAFF_ROLES] as const).map((r) => <div key={r}><dt className="font-semibold">{ROLE_LABEL[r].name}</dt><dd className="text-slate-600">{ROLE_LABEL[r].about}</dd></div>)}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
