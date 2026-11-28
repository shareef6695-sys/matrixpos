import { PrintButton } from "@/components/PrintButton";
import { waLink } from "@/lib/hq/share";

/** Print (the browser's print preview), the PDF to preview or download, and sharing by WhatsApp. */
export function DocActions({ pdf, whatsapp }: { pdf: string; whatsapp?: { phone: string | null; text: string } | null }) {
  return (
    <>
      <PrintButton label="Print" />
      <a href={pdf} target="_blank" rel="noopener" className="btn-secondary">Preview PDF</a>
      <a href={`${pdf}?download=1`} className="btn-secondary">Download PDF</a>
      {whatsapp && (
        <a href={waLink(whatsapp.phone, whatsapp.text)} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-1.5 text-emerald-700" title={whatsapp.phone ? `WhatsApp to ${whatsapp.phone}` : "Choose who to send it to in WhatsApp"}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2m0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2m4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.4-.3" /></svg>
          WhatsApp
        </a>
      )}
    </>
  );
}
