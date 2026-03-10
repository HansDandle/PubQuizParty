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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          answer_text: string
          confidence_rank: number | null
          correct: boolean | null
          game_session_id: string
          id: string
          points_awarded: number | null
          question_id: string
          submitted_at: string | null
          team_id: string
          wager_amount: number | null
        }
        Insert: {
          answer_text: string
          confidence_rank?: number | null
          correct?: boolean | null
          game_session_id: string
          id?: string
          points_awarded?: number | null
          question_id: string
          submitted_at?: string | null
          team_id: string
          wager_amount?: number | null
        }
        Update: {
          answer_text?: string
          confidence_rank?: number | null
          correct?: boolean | null
          game_session_id?: string
          id?: string
          points_awarded?: number | null
          question_id?: string
          submitted_at?: string | null
          team_id?: string
          wager_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_game_session_id_fkey"
            columns: ["game_session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          answer_reveal_mode: string
          called_question_ids: string[] | null
          created_at: string | null
          current_question_index: number | null
          current_round_id: string | null
          display_theme: string
          finished_at: string | null
          game_id: string
          host_id: string
          id: string
          leaderboard_frequency: string
          room_code: string
          started_at: string | null
          status: string
        }
        Insert: {
          answer_reveal_mode?: string
          called_question_ids?: string[] | null
          created_at?: string | null
          current_question_index?: number | null
          current_round_id?: string | null
          display_theme?: string
          finished_at?: string | null
          game_id: string
          host_id: string
          id?: string
          leaderboard_frequency?: string
          room_code: string
          started_at?: string | null
          status?: string
        }
        Update: {
          answer_reveal_mode?: string
          called_question_ids?: string[] | null
          created_at?: string | null
          current_question_index?: number | null
          current_round_id?: string | null
          display_theme?: string
          finished_at?: string | null
          game_id?: string
          host_id?: string
          id?: string
          leaderboard_frequency?: string
          room_code?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_current_round_id_fkey"
            columns: ["current_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      game_templates: {
        Row: {
          allow_confidence_scoring: boolean | null
          allow_double_round: boolean | null
          allow_wager_round: boolean | null
          answer_reveal_mode: string
          auto_advance: boolean | null
          created_at: string | null
          default_timer_seconds: number | null
          display_theme: string
          host_id: string
          id: string
          leaderboard_frequency: string
          name: string
          round_count: number
        }
        Insert: {
          allow_confidence_scoring?: boolean | null
          allow_double_round?: boolean | null
          allow_wager_round?: boolean | null
          answer_reveal_mode?: string
          auto_advance?: boolean | null
          created_at?: string | null
          default_timer_seconds?: number | null
          display_theme?: string
          host_id: string
          id?: string
          leaderboard_frequency?: string
          name: string
          round_count?: number
        }
        Update: {
          allow_confidence_scoring?: boolean | null
          allow_double_round?: boolean | null
          allow_wager_round?: boolean | null
          answer_reveal_mode?: string
          auto_advance?: boolean | null
          created_at?: string | null
          default_timer_seconds?: number | null
          display_theme?: string
          host_id?: string
          id?: string
          leaderboard_frequency?: string
          name?: string
          round_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_templates_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string | null
          host_id: string
          id: string
          status: string
          template_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          host_id: string
          id?: string
          status?: string
          template_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          host_id?: string
          id?: string
          status?: string
          template_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "game_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hosts: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      question_embeddings: {
        Row: {
          embedding: string | null
          question_id: string
        }
        Insert: {
          embedding?: string | null
          question_id: string
        }
        Update: {
          embedding?: string | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_embeddings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_history: {
        Row: {
          game_id: string | null
          host_id: string
          id: string
          question_id: string
          used_at: string | null
        }
        Insert: {
          game_id?: string | null
          host_id: string
          id?: string
          question_id: string
          used_at?: string | null
        }
        Update: {
          game_id?: string | null
          host_id?: string
          id?: string
          question_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_history_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_history_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_history_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_variants: {
        Row: {
          id: string
          question_id: string
          variant_text: string
        }
        Insert: {
          id?: string
          question_id: string
          variant_text: string
        }
        Update: {
          id?: string
          question_id?: string
          variant_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_variants_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          answer: string
          average_time_to_answer: number | null
          canonical_id: string | null
          category: string
          correct_rate: number | null
          created_at: string | null
          created_by_host_id: string | null
          difficulty: number | null
          id: string
          normalized_hash: string | null
          question_text: string
          source: string | null
          source_year: number | null
          subcategory: string | null
          tags: string[] | null
          times_used: number | null
          verified: boolean | null
        }
        Insert: {
          answer: string
          average_time_to_answer?: number | null
          canonical_id?: string | null
          category: string
          correct_rate?: number | null
          created_at?: string | null
          created_by_host_id?: string | null
          difficulty?: number | null
          id?: string
          normalized_hash?: string | null
          question_text: string
          source?: string | null
          source_year?: number | null
          subcategory?: string | null
          tags?: string[] | null
          times_used?: number | null
          verified?: boolean | null
        }
        Update: {
          answer?: string
          average_time_to_answer?: number | null
          canonical_id?: string | null
          category?: string
          correct_rate?: number | null
          created_at?: string | null
          created_by_host_id?: string | null
          difficulty?: number | null
          id?: string
          normalized_hash?: string | null
          question_text?: string
          source?: string | null
          source_year?: number | null
          subcategory?: string | null
          tags?: string[] | null
          times_used?: number | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_canonical_id_fkey"
            columns: ["canonical_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_created_by_host_id_fkey"
            columns: ["created_by_host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      round_questions: {
        Row: {
          id: string
          order_index: number
          question_id: string
          round_id: string
        }
        Insert: {
          id?: string
          order_index: number
          question_id: string
          round_id: string
        }
        Update: {
          id?: string
          order_index?: number
          question_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_questions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_templates: {
        Row: {
          confidence_enabled: boolean | null
          double_points: boolean | null
          game_template_id: string
          id: string
          points_per_question: number | null
          question_count: number
          round_name: string
          round_number: number
          timer_seconds: number | null
          wager_enabled: boolean | null
        }
        Insert: {
          confidence_enabled?: boolean | null
          double_points?: boolean | null
          game_template_id: string
          id?: string
          points_per_question?: number | null
          question_count?: number
          round_name: string
          round_number: number
          timer_seconds?: number | null
          wager_enabled?: boolean | null
        }
        Update: {
          confidence_enabled?: boolean | null
          double_points?: boolean | null
          game_template_id?: string
          id?: string
          points_per_question?: number | null
          question_count?: number
          round_name?: string
          round_number?: number
          timer_seconds?: number | null
          wager_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "round_templates_game_template_id_fkey"
            columns: ["game_template_id"]
            isOneToOne: false
            referencedRelation: "game_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          confidence_enabled: boolean | null
          double_points: boolean | null
          game_id: string
          id: string
          points_per_question: number | null
          round_name: string
          round_number: number
          timer_seconds: number | null
          wager_enabled: boolean | null
        }
        Insert: {
          confidence_enabled?: boolean | null
          double_points?: boolean | null
          game_id: string
          id?: string
          points_per_question?: number | null
          round_name: string
          round_number: number
          timer_seconds?: number | null
          wager_enabled?: boolean | null
        }
        Update: {
          confidence_enabled?: boolean | null
          double_points?: boolean | null
          game_id?: string
          id?: string
          points_per_question?: number | null
          round_name?: string
          round_number?: number
          timer_seconds?: number | null
          wager_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      season_scores: {
        Row: {
          games_played: number | null
          id: string
          points: number | null
          season_id: string
          team_id: string
          wins: number | null
        }
        Insert: {
          games_played?: number | null
          id?: string
          points?: number | null
          season_id: string
          team_id: string
          wins?: number | null
        }
        Update: {
          games_played?: number | null
          id?: string
          points?: number | null
          season_id?: string
          team_id?: string
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "season_scores_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string | null
          end_date: string | null
          host_id: string
          id: string
          name: string
          scoring_method: string
          start_date: string
          top_n_games: number | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          host_id: string
          id?: string
          name: string
          scoring_method?: string
          start_date: string
          top_n_games?: number | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          host_id?: string
          id?: string
          name?: string
          scoring_method?: string
          start_date?: string
          top_n_games?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seasons_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      session_teams: {
        Row: {
          avatar_emoji: string | null
          correct_count: number | null
          game_session_id: string
          id: string
          joined_at: string | null
          score: number | null
          team_id: string
          total_answered: number | null
        }
        Insert: {
          avatar_emoji?: string | null
          correct_count?: number | null
          game_session_id: string
          id?: string
          joined_at?: string | null
          score?: number | null
          team_id: string
          total_answered?: number | null
        }
        Update: {
          avatar_emoji?: string | null
          correct_count?: number | null
          game_session_id?: string
          id?: string
          joined_at?: string | null
          score?: number | null
          team_id?: string
          total_answered?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_teams_game_session_id_fkey"
            columns: ["game_session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_category_stats: {
        Row: {
          accuracy_rate: number | null
          category: string
          correct_answers: number | null
          id: string
          questions_seen: number | null
          team_id: string
        }
        Insert: {
          accuracy_rate?: number | null
          category: string
          correct_answers?: number | null
          id?: string
          questions_seen?: number | null
          team_id: string
        }
        Update: {
          accuracy_rate?: number | null
          category?: string
          correct_answers?: number | null
          id?: string
          questions_seen?: number | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_category_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_game_results: {
        Row: {
          created_at: string | null
          game_session_id: string
          id: string
          rank: number | null
          score: number
          team_id: string
        }
        Insert: {
          created_at?: string | null
          game_session_id: string
          id?: string
          rank?: number | null
          score?: number
          team_id: string
        }
        Update: {
          created_at?: string | null
          game_session_id?: string
          id?: string
          rank?: number | null
          score?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_game_results_game_session_id_fkey"
            columns: ["game_session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_game_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          avatar_emoji: string | null
          created_at: string | null
          home_host_id: string | null
          id: string
          password_hash: string | null
          team_name: string
        }
        Insert: {
          avatar_emoji?: string | null
          created_at?: string | null
          home_host_id?: string | null
          id?: string
          password_hash?: string | null
          team_name: string
        }
        Update: {
          avatar_emoji?: string | null
          created_at?: string | null
          home_host_id?: string | null
          id?: string
          password_hash?: string | null
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_home_host_id_fkey"
            columns: ["home_host_id"]
            isOneToOne: false
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_similar_questions: {
        Args: {
          max_results?: number
          query_question_id: string
          similarity_threshold?: number
        }
        Returns: {
          id: string
          question_text: string
          similarity: number
        }[]
      }
      increment_team_score: {
        Args: { p_delta: number; p_session_id: string; p_team_id: string }
        Returns: undefined
      }
      increment_team_total_answered: {
        Args: { p_delta: number; p_session_id: string; p_team_id: string }
        Returns: undefined
      }
      match_questions: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          answer: string
          category: string
          difficulty: number
          id: string
          question_text: string
          similarity: number
          source: string
          source_year: number
          subcategory: string
          tags: string[]
        }[]
      }
      update_team_correct_count: {
        Args: { p_delta: number; p_session_id: string; p_team_id: string }
        Returns: undefined
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

// Convenience type exports
export type Question = Database['public']['Tables']['questions']['Row'];
export type Game = Database['public']['Tables']['games']['Row'];
export type GameSession = Database['public']['Tables']['game_sessions']['Row'];
export type Round = Database['public']['Tables']['rounds']['Row'];
export type RoundQuestion = Database['public']['Tables']['round_questions']['Row'];
export type Answer = Database['public']['Tables']['answers']['Row'];
export type Team = Database['public']['Tables']['teams']['Row'];
export type SessionTeam = Database['public']['Tables']['session_teams']['Row'];
export type Host = Database['public']['Tables']['hosts']['Row'];
export type GameTemplate = Database['public']['Tables']['game_templates']['Row'];
export type RoundTemplate = Database['public']['Tables']['round_templates']['Row'];
export type Season = Database['public']['Tables']['seasons']['Row'];
export type GameEvent = 
  | { type: 'round_start'; payload: { round_id: string; round_number: number; round_name: string; question_count: number } }
  | { type: 'question_call'; payload: { round_question_id: string; question_id: string; question_text: string; question_number: number } }
  | { type: 'question_start'; payload: { question_id: string; question_text: string; question_number: number; timer_seconds: number | null } }
  | { type: 'timer_update'; payload: { seconds_remaining: number } }
  | { type: 'answer_lock'; payload: { question_id?: string } }
  | { type: 'answer_reveal'; payload: { question_id: string; correct_answer: string } }
  | { type: 'round_end'; payload: { round_id: string; round_name: string; question_stats: Array<{ question_id: string; question_text: string; correct_answer: string; percent_correct: number; total_answers: number }> } }
  | { type: 'leaderboard_show'; payload: { standings: Array<{ rank: number; team_name: string; score: number; avatar_emoji: string }> } }
  | { type: 'game_finish'; payload: {} };
