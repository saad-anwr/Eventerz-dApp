/**
 * Profile picture upload.
 *
 * `profiles.avatar_url` has existed since 0001 and both clients render it, but
 * nothing could set it from the app - there was no bucket and no upload path,
 * so the edit screen just said the avatar was generated from your wallet.
 *
 * # Why base64 and not the Blob from `fetch`
 *
 * The obvious version is `fetch(localUri).then(r => r.blob())`. On React Native
 * that Blob is a shim over a native file handle: supabase-js calls
 * `arrayBuffer()` on it, which is not implemented, and the upload silently
 * posts an empty body - a 200 response and a zero-byte object. Reading the file
 * to base64 and decoding it here produces real bytes.
 */

// Hermes has no global Buffer; the import is required, not stylistic - the same
// reason `services/solana/program.ts` imports it explicitly.
import { Buffer } from 'buffer';
import { File } from 'expo-file-system';

import { getSupabaseClient } from '@/services/auth/supabase-client';
import { assertRealIdentity } from '@/utils/identity';

const BUCKET = 'avatars';

/** Content types the bucket accepts (migration 0014). */
const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Sign-in is not configured.');
  return supabase;
}

/**
 * Upload a picked image and return its public URL.
 *
 * Writes to `avatars/<profileId>/<timestamp>.<ext>`. The folder is the uid
 * because that is what the storage policy checks - a path shaped any other way
 * is rejected by RLS rather than landing somewhere unowned.
 *
 * The filename is timestamped rather than fixed. A stable name would be
 * overwritten in place, and every CDN and `<Image>` cache in the chain would
 * keep serving the old picture until it expired.
 */
export async function uploadAvatar(
  profileId: string,
  localUri: string,
): Promise<string> {
  // A provisional `wallet:<address>` identity owns no folder, and the storage
  // policy would reject it with something unreadable.
  assertRealIdentity(profileId);

  const extension = (localUri.split('.').pop() ?? 'jpg')
    .split('?')[0]
    .toLowerCase();
  const contentType = MIME[extension] ?? 'image/jpeg';
  const path = `${profileId}/${Date.now()}.${extension}`;

  const base64 = await new File(localUri).base64();
  const bytes = Buffer.from(base64, 'base64');

  if (bytes.byteLength === 0) {
    throw new Error('That image could not be read.');
  }

  const { error } = await client()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });

  if (error) throw new Error(error.message);

  const {
    data: { publicUrl },
  } = client().storage.from(BUCKET).getPublicUrl(path);

  return publicUrl;
}
