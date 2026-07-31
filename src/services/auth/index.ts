// `auth-service` already re-exports `isSupabaseConfigured`, so the client
// module only contributes the factory here - exporting it twice is ambiguous.
export * from './auth-service';
export * from './types';
export { getSupabaseClient } from './supabase-client';
