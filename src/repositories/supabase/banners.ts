/**
 * Event banner upload.
 *
 * # The bug this fixes
 *
 * The create wizard set `coverImage` to the URI `expo-image-picker` returns -
 * a device-local path like `file:///data/user/0/.../ImagePicker/abc.jpeg` - and
 * that string went straight into `events.cover_image` and was never uploaded
 * anywhere.
 *
 * The preview inside the wizard looked right, because on that device, in that
 * process, the file existed. Everywhere else the value was meaningless:
 *
 *   * the event page showed the bare gradient, because the URI pointed at the
 *     picker's cache directory, which the OS clears;
 *   * the website showed a broken image, because `file://` on a server-rendered
 *     page addresses the *visitor's* disk;
 *   * every other guest saw nothing at all.
 *
 * So the banner appeared to upload, and was never anywhere but one cache
 * folder. This module is the missing step: read the picked file, put the bytes
 * in the `event-banners` bucket (migration 0004), and hand back the public URL
 * that every client can actually fetch.
 *
 * # Why base64 rather than the Blob from `fetch`
 *
 * The same reason `avatars.ts` does it: on React Native `fetch(uri).blob()`
 * returns a shim over a native file handle whose `arrayBuffer()` is not
 * implemented, so supabase-js posts an empty body and stores a zero-byte
 * object - a 200 response and a broken image. Decoding base64 here produces
 * real bytes.
 */

// Hermes has no global Buffer; the import is load-bearing, not stylistic.
import { Buffer } from 'buffer';
import { File } from 'expo-file-system';

import { getSupabaseClient } from '@/services/auth/supabase-client';
import { assertRealIdentity } from '@/utils/identity';

const BUCKET = 'event-banners';

/** Matches the bucket's `file_size_limit` in migration 0004. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Content types the bucket accepts (migration 0004). */
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
 * True for anything already hosted - an `https://` URL, or the public URL of a
 * banner uploaded earlier.
 *
 * Editing an event re-submits whatever `coverImage` holds, and for an unchanged
 * banner that is the URL we stored last time. Re-uploading it would copy the
 * file on every save and orphan the previous object, so the caller uses this to
 * skip.
 */
export function isRemoteUri(uri: string | undefined | null): boolean {
  return typeof uri === 'string' && /^https?:\/\//i.test(uri);
}

/**
 * Upload a picked banner and return its public URL.
 *
 * Writes to `event-banners/<profileId>/<timestamp>.<ext>`. The folder must be
 * the uid because that is what the storage policy checks - a path shaped any
 * other way is rejected by RLS rather than landing somewhere unowned.
 */
export async function uploadEventBanner(
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
  if (bytes.byteLength > MAX_BYTES) {
    const mb = (bytes.byteLength / 1024 / 1024).toFixed(1);
    throw new Error(`That image is ${mb} MB. The limit is 5 MB.`);
  }

  const { error } = await client()
    .storage.from(BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: false,
      cacheControl: '31536000',
    });

  if (error) throw new Error(error.message);

  const {
    data: { publicUrl },
  } = client().storage.from(BUCKET).getPublicUrl(path);

  return publicUrl;
}
