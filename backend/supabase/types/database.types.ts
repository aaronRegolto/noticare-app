export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Not part of the generated schema — a convenience type for get_community_stats'
// p_range parameter. Re-add this after every `gen types` regeneration.
export type CommunityRange = 'last_24_hours' | 'today' | 'last_7_days' | 'last_30_days' | 'last_6_months'

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      community_daily_stats: {
        Row: {
          bucket_date: string
          created_at: string
          dangerous_count: number
          safe_count: number
          successfully_blocked_count: number
          suspicious_count: number
          updated_at: string
        }
        Insert: {
          bucket_date: string
          created_at?: string
          dangerous_count?: number
          safe_count?: number
          successfully_blocked_count?: number
          suspicious_count?: number
          updated_at?: string
        }
        Update: {
          bucket_date?: string
          created_at?: string
          dangerous_count?: number
          safe_count?: number
          successfully_blocked_count?: number
          suspicious_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      community_hourly_stats: {
        Row: {
          bucket_start: string
          created_at: string
          dangerous_count: number
          safe_count: number
          successfully_blocked_count: number
          suspicious_count: number
          updated_at: string
        }
        Insert: {
          bucket_start: string
          created_at?: string
          dangerous_count?: number
          safe_count?: number
          successfully_blocked_count?: number
          suspicious_count?: number
          updated_at?: string
        }
        Update: {
          bucket_start?: string
          created_at?: string
          dangerous_count?: number
          safe_count?: number
          successfully_blocked_count?: number
          suspicious_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          app_version: string
          created_at: string
          id: string
          installation_id: string
          last_seen_at: string
          rule_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version: string
          created_at?: string
          id?: string
          installation_id: string
          last_seen_at?: string
          rule_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string
          created_at?: string
          id?: string
          installation_id?: string
          last_seen_at?: string
          rule_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      linked_phone_numbers: {
        Row: {
          created_at: string
          id: string
          phone_e164: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_e164: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_e164?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linked_phone_numbers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          paymongo_customer_id: string | null
          phone_last4: string | null
          plan: string
          plan_updated_at: string
          pro_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          paymongo_customer_id?: string | null
          phone_last4?: string | null
          plan?: string
          plan_updated_at?: string
          pro_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          paymongo_customer_id?: string | null
          phone_last4?: string | null
          plan?: string
          plan_updated_at?: string
          pro_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rule_sets: {
        Row: {
          active: boolean
          checksum: string
          created_at: string
          published_at: string
          rule_bundle: Json
          version: string
        }
        Insert: {
          active?: boolean
          checksum: string
          created_at?: string
          published_at?: string
          rule_bundle: Json
          version: string
        }
        Update: {
          active?: boolean
          checksum?: string
          created_at?: string
          published_at?: string
          rule_bundle?: Json
          version?: string
        }
        Relationships: []
      }
      scan_feedback: {
        Row: {
          created_at: string
          event_id: string | null
          expected_level: Database["public"]["Enums"]["threat_level"]
          id: string
          indicator_codes: string[]
          rule_version: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          expected_level: Database["public"]["Enums"]["threat_level"]
          id?: string
          indicator_codes?: string[]
          rule_version: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          expected_level?: Database["public"]["Enums"]["threat_level"]
          id?: string
          indicator_codes?: string[]
          rule_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_feedback_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "threat_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      threat_events: {
        Row: {
          blocked: boolean
          client_event_id: string
          device_id: string
          id: string
          indicator_codes: string[]
          is_demo: boolean
          occurred_at: string
          received_at: string
          rule_version: string
          score_bucket: number
          source: Database["public"]["Enums"]["threat_source"]
          threat_level: Database["public"]["Enums"]["threat_level"]
          url_count: number
          user_id: string
        }
        Insert: {
          blocked?: boolean
          client_event_id: string
          device_id: string
          id?: string
          indicator_codes?: string[]
          is_demo?: boolean
          occurred_at?: string
          received_at?: string
          rule_version: string
          score_bucket: number
          source: Database["public"]["Enums"]["threat_source"]
          threat_level: Database["public"]["Enums"]["threat_level"]
          url_count?: number
          user_id: string
        }
        Update: {
          blocked?: boolean
          client_event_id?: string
          device_id?: string
          id?: string
          indicator_codes?: string[]
          is_demo?: boolean
          occurred_at?: string
          received_at?: string
          rule_version?: string
          score_bucket?: number
          source?: Database["public"]["Enums"]["threat_source"]
          threat_level?: Database["public"]["Enums"]["threat_level"]
          url_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "threat_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threat_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      viral_phishing_report_events: {
        Row: {
          created_at: string
          device_id: string
          id: string
          report_id: string
          risk_score: number | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          report_id: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          report_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viral_phishing_report_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viral_phishing_report_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "viral_phishing_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viral_phishing_report_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      viral_phishing_reports: {
        Row: {
          created_at: string
          first_reported_at: string
          id: string
          indicator_codes: string[]
          last_reported_at: string
          message_hash: string
          message_text: string
          report_count: number
          rule_version: string
          sample_sender: string | null
          updated_at: string
          viral_score: number
        }
        Insert: {
          created_at?: string
          first_reported_at?: string
          id?: string
          indicator_codes?: string[]
          last_reported_at?: string
          message_hash: string
          message_text: string
          report_count?: number
          rule_version: string
          sample_sender?: string | null
          updated_at?: string
          viral_score?: number
        }
        Update: {
          created_at?: string
          first_reported_at?: string
          id?: string
          indicator_codes?: string[]
          last_reported_at?: string
          message_hash?: string
          message_text?: string
          report_count?: number
          rule_version?: string
          sample_sender?: string | null
          updated_at?: string
          viral_score?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assert_indicator_codes: {
        Args: { p_codes: string[]; p_rule_version: string }
        Returns: undefined
      }
      delete_my_account: { Args: never; Returns: undefined }
      get_community_stats: {
        Args: { p_range: string }
        Returns: {
          blocked_count: number
          dangerous_count: number
          date: string
          safe_count: number
          suspicious_count: number
        }[]
      }
      get_phishing_message_virality: {
        Args: { p_message_text: string }
        Returns: {
          first_reported_at: string
          report_count: number
          report_id: string
          viral_score: number
        }[]
      }
      get_viral_phishing_ranking: {
        Args: { p_limit?: number; p_source?: string }
        Returns: {
          first_reported_at: string
          last_reported_at: string
          message_text: string
          report_count: number
          report_id: string
          risk_score: number | null
          sample_sender: string
          viral_score: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      list_linked_phones: {
        Args: never
        Returns: {
          created_at: string
          phone_e164: string
        }[]
      }
      normalize_phishing_message_text: {
        Args: { p_text: string }
        Returns: string
      }
      record_linked_phone: {
        Args: { p_previous_phone: string }
        Returns: undefined
      }
      record_phishing_report: {
        Args: {
          p_device_id: string
          p_indicator_codes: string[]
          p_message_text: string
          p_rule_version: string
          p_risk_score?: number | null
          p_sample_sender: string | null
          p_source?: string
        }
        Returns: {
          is_first_reporter: boolean
          report_count: number
          report_id: string
          viral_score: number
        }[]
      }
      record_threat_event: {
        Args: {
          p_blocked: boolean
          p_client_event_id: string
          p_device_id: string
          p_indicator_codes: string[]
          p_is_demo?: boolean
          p_occurred_at: string
          p_rule_version: string
          p_score_bucket: number
          p_source: Database["public"]["Enums"]["threat_source"]
          p_threat_level: Database["public"]["Enums"]["threat_level"]
          p_url_count: number
        }
        Returns: string
      }
      register_device: {
        Args: {
          p_app_version: string
          p_installation_id: string
          p_rule_version: string
        }
        Returns: {
          app_version: string
          created_at: string
          id: string
          installation_id: string
          last_seen_at: string
          rule_version: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_primary_phone: { Args: { p_phone: string }; Returns: string }
      submit_scan_feedback: {
        Args: {
          p_event_id: string | null
          p_expected_level: Database["public"]["Enums"]["threat_level"]
          p_indicator_codes: string[]
          p_rule_version: string
        }
        Returns: string
      }
      unlink_phone: { Args: { p_phone: string }; Returns: boolean }
    }
    Enums: {
      threat_level: "safe" | "suspicious" | "dangerous"
      threat_source: "realtime" | "manual"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      threat_level: ["safe", "suspicious", "dangerous"],
      threat_source: ["realtime", "manual"],
    },
  },
} as const
