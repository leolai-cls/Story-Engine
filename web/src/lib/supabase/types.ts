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
      turns: {
        Row: {
          created_at: string
          credits_charged: number | null
          director_input_tokens: number | null
          director_output_tokens: number | null
          director_verdict: Json | null
          id: string
          input_tokens: number | null
          llm_provider: string | null
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
          created_at?: string
          credits_charged?: number | null
          director_input_tokens?: number | null
          director_output_tokens?: number | null
          director_verdict?: Json | null
          id?: string
          input_tokens?: number | null
          llm_provider?: string | null
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
          created_at?: string
          credits_charged?: number | null
          director_input_tokens?: number | null
          director_output_tokens?: number | null
          director_verdict?: Json | null
          id?: string
          input_tokens?: number | null
          llm_provider?: string | null
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
      [_ in never]: never
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
