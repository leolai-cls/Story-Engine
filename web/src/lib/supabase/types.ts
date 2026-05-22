export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      credit_ledger: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          metadata: Json | null
          reason: string
          ref_id: string | null
          ref_type: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          metadata?: Json | null
          reason: string
          ref_id?: string | null
          ref_type?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json | null
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lorebook_entries: {
        Row: {
          always_on: boolean
          created_at: string
          description: string
          embedding: string
          entity_type: string
          id: string
          keywords: string[]
          name: string
          playthrough_id: string
          updated_at: string
        }
        Insert: {
          always_on?: boolean
          created_at?: string
          description: string
          embedding: string
          entity_type: string
          id?: string
          keywords?: string[]
          name: string
          playthrough_id: string
          updated_at?: string
        }
        Update: {
          always_on?: boolean
          created_at?: string
          description?: string
          embedding?: string
          entity_type?: string
          id?: string
          keywords?: string[]
          name?: string
          playthrough_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lorebook_entries_playthrough_id_fkey"
            columns: ["playthrough_id"]
            isOneToOne: false
            referencedRelation: "playthroughs"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_summaries: {
        Row: {
          created_at: string
          embedding: string
          id: string
          input_tokens: number | null
          output_tokens: number | null
          playthrough_id: string
          summary_text: string
          turn_range: unknown
        }
        Insert: {
          created_at?: string
          embedding: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          playthrough_id: string
          summary_text: string
          turn_range: unknown
        }
        Update: {
          created_at?: string
          embedding?: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          playthrough_id?: string
          summary_text?: string
          turn_range?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "memory_summaries_playthrough_id_fkey"
            columns: ["playthrough_id"]
            isOneToOne: false
            referencedRelation: "playthroughs"
            referencedColumns: ["id"]
          },
        ]
      }
      playthrough_character_states: {
        Row: {
          character_id: string
          disposition: Json
          last_interaction_turn: number | null
          permanent_flags: string[]
          playthrough_id: string
          recent_interactions_summary: string | null
          updated_at: string
        }
        Insert: {
          character_id: string
          disposition?: Json
          last_interaction_turn?: number | null
          permanent_flags?: string[]
          playthrough_id: string
          recent_interactions_summary?: string | null
          updated_at?: string
        }
        Update: {
          character_id?: string
          disposition?: Json
          last_interaction_turn?: number | null
          permanent_flags?: string[]
          playthrough_id?: string
          recent_interactions_summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playthrough_character_states_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "story_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playthrough_character_states_playthrough_id_fkey"
            columns: ["playthrough_id"]
            isOneToOne: false
            referencedRelation: "playthroughs"
            referencedColumns: ["id"]
          },
        ]
      }
      playthroughs: {
        Row: {
          character_name: string | null
          created_at: string
          current_state: Json
          id: string
          last_played_at: string
          llm_model: string | null
          llm_provider: string | null
          status: string
          story_id: string
          turn_count: number
          user_id: string
        }
        Insert: {
          character_name?: string | null
          created_at?: string
          current_state?: Json
          id?: string
          last_played_at?: string
          llm_model?: string | null
          llm_provider?: string | null
          status?: string
          story_id: string
          turn_count?: number
          user_id: string
        }
        Update: {
          character_name?: string | null
          created_at?: string
          current_state?: Json
          id?: string
          last_played_at?: string
          llm_model?: string | null
          llm_provider?: string | null
          status?: string
          story_id?: string
          turn_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playthroughs_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playthroughs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          adult_mode_enabled: boolean
          avatar_url: string | null
          created_at: string
          credit_balance: number
          credit_period_end: string | null
          default_llm_provider: string | null
          default_model: string | null
          display_name: string | null
          id: string
          is_age_verified: boolean
          locale: string
          subscription_tier: string
          updated_at: string
        }
        Insert: {
          adult_mode_enabled?: boolean
          avatar_url?: string | null
          created_at?: string
          credit_balance?: number
          credit_period_end?: string | null
          default_llm_provider?: string | null
          default_model?: string | null
          display_name?: string | null
          id: string
          is_age_verified?: boolean
          locale?: string
          subscription_tier?: string
          updated_at?: string
        }
        Update: {
          adult_mode_enabled?: boolean
          avatar_url?: string | null
          created_at?: string
          credit_balance?: number
          credit_period_end?: string | null
          default_llm_provider?: string | null
          default_model?: string | null
          display_name?: string | null
          id?: string
          is_age_verified?: boolean
          locale?: string
          subscription_tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          allow_remix: boolean
          content_rating: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          fork_count: number
          genre: string | null
          id: string
          language: string
          opening_narrative: string | null
          origin: string
          owner_id: string | null
          play_count: number
          prompt_seed: string
          rating_avg: number | null
          rating_count: number
          state_schema: Json
          story_bible: Json
          tags: string[]
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          allow_remix?: boolean
          content_rating?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          fork_count?: number
          genre?: string | null
          id?: string
          language?: string
          opening_narrative?: string | null
          origin?: string
          owner_id?: string | null
          play_count?: number
          prompt_seed: string
          rating_avg?: number | null
          rating_count?: number
          state_schema?: Json
          story_bible?: Json
          tags?: string[]
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          allow_remix?: boolean
          content_rating?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          fork_count?: number
          genre?: string | null
          id?: string
          language?: string
          opening_narrative?: string | null
          origin?: string
          owner_id?: string | null
          play_count?: number
          prompt_seed?: string
          rating_avg?: number | null
          rating_count?: number
          state_schema?: Json
          story_bible?: Json
          tags?: string[]
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      story_characters: {
        Row: {
          arc_description: string | null
          backstory: string | null
          core_motivation: string | null
          created_at: string
          default_disposition_toward_protagonist: string | null
          id: string
          name: string
          personality_traits: string[]
          red_lines: string[]
          role: string | null
          story_id: string
          voice_sample: string | null
        }
        Insert: {
          arc_description?: string | null
          backstory?: string | null
          core_motivation?: string | null
          created_at?: string
          default_disposition_toward_protagonist?: string | null
          id?: string
          name: string
          personality_traits?: string[]
          red_lines?: string[]
          role?: string | null
          story_id: string
          voice_sample?: string | null
        }
        Update: {
          arc_description?: string | null
          backstory?: string | null
          core_motivation?: string | null
          created_at?: string
          default_disposition_toward_protagonist?: string | null
          id?: string
          name?: string
          personality_traits?: string[]
          red_lines?: string[]
          role?: string | null
          story_id?: string
          voice_sample?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_characters_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          payload: Json | null
          processed_at: string | null
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      turn_embeddings: {
        Row: {
          created_at: string
          embedding: string
          turn_id: string
        }
        Insert: {
          created_at?: string
          embedding: string
          turn_id: string
        }
        Update: {
          created_at?: string
          embedding?: string
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turn_embeddings_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: true
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      turns: {
        Row: {
          cached_input_tokens: number | null
          created_at: string
          credits_charged: number | null
          director_input_tokens: number | null
          director_output_tokens: number | null
          director_verdict: Json | null
          embed_tokens: number | null
          id: string
          input_tokens: number | null
          llm_provider: string | null
          lorebook_input_tokens: number | null
          lorebook_output_tokens: number | null
          model: string | null
          output_tokens: number | null
          playthrough_id: string
          role: string
          skill_check: Json | null
          state_delta: Json | null
          text: string
          turn_index: number
        }
        Insert: {
          cached_input_tokens?: number | null
          created_at?: string
          credits_charged?: number | null
          director_input_tokens?: number | null
          director_output_tokens?: number | null
          director_verdict?: Json | null
          embed_tokens?: number | null
          id?: string
          input_tokens?: number | null
          llm_provider?: string | null
          lorebook_input_tokens?: number | null
          lorebook_output_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          playthrough_id: string
          role: string
          skill_check?: Json | null
          state_delta?: Json | null
          text: string
          turn_index: number
        }
        Update: {
          cached_input_tokens?: number | null
          created_at?: string
          credits_charged?: number | null
          director_input_tokens?: number | null
          director_output_tokens?: number | null
          director_verdict?: Json | null
          embed_tokens?: number | null
          id?: string
          input_tokens?: number | null
          llm_provider?: string | null
          lorebook_input_tokens?: number | null
          lorebook_output_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          playthrough_id?: string
          role?: string
          skill_check?: Json | null
          state_delta?: Json | null
          text?: string
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "turns_playthrough_id_fkey"
            columns: ["playthrough_id"]
            isOneToOne: false
            referencedRelation: "playthroughs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_next_turn_pair: {
        Args: { p_playthrough_id: string }
        Returns: {
          ai_idx: number
          user_idx: number
        }[]
      }
      apply_credit_charge: {
        Args: {
          p_delta: number
          p_metadata?: Json
          p_reason: string
          p_ref_id?: string
          p_ref_type?: string
          p_user_id: string
        }
        Returns: {
          ledger_id: string
          new_balance: number
        }[]
      }
      apply_turn_npc_changes: {
        Args: {
          p_character_id: string
          p_disposition_delta: Json
          p_new_flags: string[]
          p_playthrough_id: string
          p_turn_index: number
        }
        Returns: undefined
      }
      match_lorebook_entries:
        | {
            Args: {
              p_match_count: number
              p_playthrough_id: string
              p_query_embedding: string
            }
            Returns: {
              description: string
              entity_type: string
              id: string
              name: string
              similarity: number
            }[]
          }
        | {
            Args: {
              p_match_count: number
              p_min_similarity?: number
              p_playthrough_id: string
              p_query_embedding: string
            }
            Returns: {
              description: string
              entity_type: string
              id: string
              name: string
              similarity: number
            }[]
          }
      match_memory_summaries:
        | {
            Args: {
              p_match_count: number
              p_playthrough_id: string
              p_query_embedding: string
            }
            Returns: {
              id: string
              similarity: number
              summary_text: string
              turn_range: unknown
            }[]
          }
        | {
            Args: {
              p_match_count: number
              p_min_similarity?: number
              p_playthrough_id: string
              p_query_embedding: string
            }
            Returns: {
              id: string
              similarity: number
              summary_text: string
              turn_range: unknown
            }[]
          }
      match_turn_embeddings:
        | {
            Args: {
              p_exclude_turn_indexes?: number[]
              p_match_count: number
              p_playthrough_id: string
              p_query_embedding: string
            }
            Returns: {
              role: string
              similarity: number
              text: string
              turn_id: string
              turn_index: number
            }[]
          }
        | {
            Args: {
              p_exclude_turn_indexes?: number[]
              p_match_count: number
              p_min_similarity?: number
              p_playthrough_id: string
              p_query_embedding: string
            }
            Returns: {
              role: string
              similarity: number
              text: string
              turn_id: string
              turn_index: number
            }[]
          }
      refresh_free_tier_credits: {
        Args: { p_target_balance?: number }
        Returns: {
          refreshed_count: number
          total_credits_granted: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
