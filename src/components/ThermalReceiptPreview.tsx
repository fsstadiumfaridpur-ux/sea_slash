import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type ReceiptWidth } from '../utils/dailyCashReceipt';

interface Props {
  title: string;
  renderReceipt: (width: ReceiptWidth) => string;
  onClose: () => void;
}

export function ThermalReceiptPreview({ title, renderReceipt, onClose }: Props) {
  const [width, setWidth] = useState<ReceiptWidth>(80);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const html = useMemo(() => renderReceipt(width), [renderReceipt, width]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [onClose]);
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-labelledby="cash-print-title">
    <section className="flex max-h-[95dvh] w-full max-w-xl flex-col rounded-xl bg-white p-4 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-white">
      <div className="flex items-center justify-between gap-3"><h2 id="cash-print-title" className="text-lg font-bold">{title}</h2><button ref={closeButton} type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">Close</button></div>
      <div className="my-3 flex flex-wrap items-center gap-3"><label className="text-sm">Paper width <select aria-label="Receipt paper width" value={width} onChange={event => { setReady(false); setError(''); setWidth(Number(event.target.value) as ReceiptWidth); }} className="ml-2 rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-700"><option value={80}>80mm</option><option value={58}>58mm</option></select></label><button type="button" disabled={!ready} onClick={() => {
        try { const printerWindow = frame.current?.contentWindow; if (!printerWindow) throw new Error('Receipt is still loading.'); printerWindow.focus(); printerWindow.print(); }
        catch { setError('Could not open the print dialog. Open this app in Chrome or Edge and try again.'); }
      }} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Print Receipt</button></div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Select your thermal printer in the print dialog. Match the paper width to {width}mm, use 100% scale, no margins, and turn off browser headers and footers. Your existing order software can keep its printer settings.</p>
      {error && <p role="alert" className="mb-3 text-sm text-rose-600">{error}</p>}
      <div className="overflow-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-800"><iframe key={html} ref={frame} title={`${title} preview`} srcDoc={html} onLoad={() => setReady(true)} style={{ width: `${width}mm`, maxWidth: '100%', height: '60vh', display: 'block', margin: '0 auto', border: 0, background: 'white' }} /></div>
    </section>
  </div>, document.body);
}
