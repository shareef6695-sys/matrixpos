"use client";

/** Last-resort error page, used when the root layout itself fails. Shows only the error code, never details. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#f8fafc" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#475569", fontSize: 14 }}>Please try again. If it keeps happening, contact MatrixPOS support and quote the code below.</p>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>Code: {error.digest}</p>}
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
