'use client';
import { useRef, useState } from 'react';
import { Paperclip, Upload } from 'lucide-react';
import { uploadClientFile } from '@/lib/files';

/** Upload one or more files for a client / task / requested document. */
export function UploadButton({ clientId, taskId, documentId, onDone, label = 'Upload files', compact }: {
  clientId: string; taskId?: string | null; documentId?: string; onDone: () => void; label?: string; compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    try {
      for (const [i, file] of [...files].entries()) {
        setBusy(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : 'Uploading…');
        // Only the first file may fill a requested document; the rest become new rows.
        await uploadClientFile({ clientId, file, taskId, documentId: i === 0 ? documentId : undefined });
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <input ref={input} type="file" multiple={!documentId} hidden onChange={(e) => onPick(e.target.files)} />
      {compact ? (
        <button type="button" onClick={() => input.current?.click()} disabled={!!busy} title={label}
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline disabled:opacity-50">
          <Paperclip size={13} /> {busy ?? label}
        </button>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Upload size={15} /> {busy ?? label}
        </button>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
