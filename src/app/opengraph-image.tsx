import { ImageResponse } from "next/og";

export const alt = "MatrixPOS: the POS system for UK supermarkets and convenience stores";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share image used for every page (Facebook, LinkedIn, WhatsApp, X). */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0f766e 0%, #134e4a 100%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: "white", color: "#0f766e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 800 }}>M</div>
          <div style={{ fontSize: 44, fontWeight: 800 }}>MatrixPOS</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1 }}>The POS system for UK supermarkets and convenience stores</div>
          <div style={{ fontSize: 32, marginTop: 28, color: "#ccfbf1" }}>From £12 a month · 14-day free trial · No card needed</div>
        </div>
      </div>
    ),
    size,
  );
}
