'use client';
import { supabase } from './supabase';

export const BUCKET = 'client-files';
export const MAX_FILE_MB = 25;

const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(-120) || 'file';

/**
 * Upload a file for a client (optionally tied to a task) and record it in the
 * documents table as "received". Pass `documentId` to attach the file to an
 * existing requested document instead of creating a new row.
 */
export async function uploadClientFile(opts: { clientId: string; file: File; taskId?: string | null; documentId?: string; name?: string }) {
  const { clientId, file } = opts;
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is larger than ${MAX_FILE_MB} MB.`);
  const sb = supabase();
  const path = `${clientId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { data: { user } } = await sb.auth.getUser();
  const fileCols = { file_path: path, file_name: file.name, file_size: file.size, uploaded_by: user?.id ?? null, status: 'received' };
  const res = opts.documentId
    ? await sb.from('documents').update(fileCols).eq('id', opts.documentId)
    : await sb.from('documents').insert({ client_id: clientId, task_id: opts.taskId ?? null, name: opts.name ?? file.name, ...fileCols });
  if (res.error) {
    await sb.storage.from(BUCKET).remove([path]);
    throw new Error(res.error.message);
  }
}

/** Open a private file through a short-lived signed link. */
export async function openFile(path: string) {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) throw new Error(error?.message ?? 'Could not open the file.');
  window.open(data.signedUrl, '_blank', 'noopener');
}

/** Delete the stored file and clear it from the document row (keeps the checklist item). */
export async function removeFile(docId: string, path: string) {
  const sb = supabase();
  const rm = await sb.storage.from(BUCKET).remove([path]);
  if (rm.error) throw new Error(rm.error.message);
  await sb.from('documents').update({ file_path: null, file_name: null, file_size: null }).eq('id', docId);
}

export const fileSize = (b: number | null) =>
  b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
