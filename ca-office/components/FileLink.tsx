'use client';
import { useState } from 'react';
import { FileText, X } from 'lucide-react';
import { fileSize, openFile, removeFile } from '@/lib/files';

export function FileLink({ doc, onRemoved }: { doc: { id: string; file_path: string | null; file_name: string | null; file_size: number | null }; onRemoved?: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (!doc.file_path) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <button type="button" onClick={(e) => { e.stopPropagation(); openFile(doc.file_path!).catch((x) => setError(x.message)); }}
        className="inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100">
        <FileText size={13} /> {doc.file_name} <span className="font-normal text-brand-600/70">{fileSize(doc.file_size)}</span>
      </button>
      {onRemoved && (confirming ? (
        <span className="inline-flex items-center gap-1">
          <button type="button" className="text-rose-600 hover:underline" onClick={(e) => { e.stopPropagation(); removeFile(doc.id, doc.file_path!).then(onRemoved).catch((x) => setError(x.message)); }}>Delete file</button>
          <button type="button" className="text-slate-500 hover:underline" onClick={(e) => { e.stopPropagation(); setConfirming(false); }}>Keep</button>
        </span>
      ) : (
        <button type="button" aria-label="Remove file" className="text-slate-400 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); setConfirming(true); }}><X size={13} /></button>
      ))}
      {error && <span className="text-rose-600">{error}</span>}
    </span>
  );
}
