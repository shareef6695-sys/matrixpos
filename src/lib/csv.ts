const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Prefix formula-like cells so spreadsheets don't execute them (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const csv = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(",")).join("\r\n");
