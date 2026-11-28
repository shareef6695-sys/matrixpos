// Making Tax Digital for VAT: the pure parts (fraud prevention headers and the return body), unit tested.

/** What the browser tells us about itself when a return is submitted (collected by the submit form). */
export interface ClientInfo {
  userAgent: string; timezoneOffset: number; // minutes, as Date.getTimezoneOffset() gives
  screens: { width: number; height: number; scale: number; depth: number }[]; window: { width: number; height: number };
}

export function parseClientInfo(raw: string): ClientInfo | null {
  try {
    const j = JSON.parse(raw);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    if (typeof j?.userAgent !== "string" || !j.userAgent) return null;
    return {
      userAgent: String(j.userAgent ?? "").slice(0, 500), timezoneOffset: num(j.timezoneOffset),
      screens: (Array.isArray(j.screens) ? j.screens : []).slice(0, 8).map((s: Record<string, unknown>) => ({ width: num(s.width), height: num(s.height), scale: num(s.scale) || 1, depth: num(s.depth) })),
      window: { width: num(j.window?.width), height: num(j.window?.height) },
    };
  } catch { return null; }
}

const enc = encodeURIComponent;

/** UTC+01:00 style, from a getTimezoneOffset() value (which is minutes behind UTC, so -60 in British Summer Time). */
export function utcOffset(minutes: number) {
  const m = -minutes, sign = m < 0 ? "-" : "+", a = Math.abs(m);
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/**
 * HMRC's fraud prevention headers for a web app whose server talks to HMRC (WEB_APP_VIA_SERVER).
 * Headers we can't know (the client's port, the server's own public IP on Vercel) are left out.
 */
export function fraudHeaders(p: { client: ClientInfo; deviceId: string; clientIp: string | null; userId: string; version: string; at?: Date }) {
  const h: Record<string, string> = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": p.client.userAgent,
    "Gov-Client-Device-ID": p.deviceId,
    "Gov-Client-Timezone": utcOffset(p.client.timezoneOffset),
    "Gov-Client-Screens": p.client.screens.map((s) => `width=${s.width}&height=${s.height}&scaling-factor=${s.scale}&colour-depth=${s.depth}`).join(","),
    "Gov-Client-Window-Size": `width=${p.client.window.width}&height=${p.client.window.height}`,
    "Gov-Client-User-IDs": `matrixhq=${enc(p.userId)}`,
    "Gov-Vendor-Product-Name": enc("Matrix HQ"),
    "Gov-Vendor-Version": `${enc("Matrix HQ")}=${enc(p.version)}`,
  };
  if (p.clientIp) {
    h["Gov-Client-Public-IP"] = p.clientIp;
    h["Gov-Client-Public-IP-Timestamp"] = (p.at ?? new Date()).toISOString();
    h["Gov-Vendor-Forwarded"] = `for=${enc(p.clientIp)}`;
  }
  return h;
}

/** The body HMRC expects for a 9-box return: boxes 1-5 in pounds and pence, 6-9 in whole pounds. */
export function returnBody(periodKey: string, b: { box1: number; box2: number; box3: number; box4: number; box5: number; box6: number; box7: number; box8: number; box9: number }) {
  const gbp = (p: number) => Math.round(p) / 100;
  return {
    periodKey,
    vatDueSales: gbp(b.box1), vatDueAcquisitions: gbp(b.box2), totalVatDue: gbp(b.box3),
    vatReclaimedCurrPeriod: gbp(b.box4), netVatDue: gbp(Math.abs(b.box5)),
    totalValueSalesExVAT: b.box6, totalValuePurchasesExVAT: b.box7, totalValueGoodsSuppliedExVAT: b.box8, totalAcquisitionsExVAT: b.box9,
    finalised: true,
  };
}
