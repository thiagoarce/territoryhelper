import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Profile } from '$lib/types';

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient;
      safeGetSession: () => Promise<{ session: Session | null; user: import('@supabase/supabase-js').User | null }>;
      session: Session | null;
      user: import('@supabase/supabase-js').User | null;
      profile: Profile | null;
    }
    interface PageData {
      session: Session | null;
      profile: Profile | null;
    }
  }
}

export {};
