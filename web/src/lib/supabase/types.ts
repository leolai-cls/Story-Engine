// Auto-generated Supabase types will replace this file once we run:
//   npx supabase gen types typescript --local > src/lib/supabase/types.ts
// For now, minimal hand-written types to unblock Phase 0 work.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          locale: string;
          avatar_url: string | null;
          is_age_verified: boolean;
          adult_mode_enabled: boolean;
          subscription_tier: string;
          credit_balance: number;
          credit_period_end: string | null;
          default_llm_provider: string | null;
          default_model: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
    };
  };
};
