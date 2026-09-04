/**
 * GENERATED DATABASE TYPES
 *
 * Source: backend/supabase/migrations
 * Regenerate against the linked project after every migration:
 *   npx supabase gen types typescript --linked --schema public > backend/supabase/types/database.types.ts
 *
 * Do not add raw message, sender, URL, OTP, or device-hardware fields here.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CommunityRange = 'today' | 'last_7_days' | 'last_30_days' | 'last_6_months';

export type Database = {
  public: {
    Tables: {
      community_daily_stats: {
        Row: {
          bucket_date: string;
          created_at: string;
          dangerous_count: number;
          safe_count: number;
          successfully_blocked_count: number;
          suspicious_count: number;
          updated_at: string;
        };
        Insert: {
          bucket_date: string;
          created_at?: string;
          dangerous_count?: number;
          safe_count?: number;
          successfully_blocked_count?: number;
          suspicious_count?: number;
          updated_at?: string;
        };
        Update: {
          bucket_date?: string;
          created_at?: string;
          dangerous_count?: number;
          safe_count?: number;
          successfully_blocked_count?: number;
          suspicious_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      community_hourly_stats: {
        Row: {
          bucket_start: string;
          created_at: string;
          dangerous_count: number;
          safe_count: number;
          successfully_blocked_count: number;
          suspicious_count: number;
          updated_at: string;
        };
        Insert: {
          bucket_start: string;
          created_at?: string;
          dangerous_count?: number;
          safe_count?: number;
          successfully_blocked_count?: number;
          suspicious_count?: number;
          updated_at?: string;
        };
        Update: {
          bucket_start?: string;
          created_at?: string;
          dangerous_count?: number;
          safe_count?: number;
          successfully_blocked_count?: number;
          suspicious_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      devices: {
        Row: {
          app_version: string;
          created_at: string;
          id: string;
          installation_id: string;
          last_seen_at: string;
          rule_version: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          app_version: string;
          created_at?: string;
          id?: string;
          installation_id: string;
          last_seen_at?: string;
          rule_version: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          app_version?: string;
          created_at?: string;
          id?: string;
          installation_id?: string;
          last_seen_at?: string;
          rule_version?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          phone_last4: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          phone_last4?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          phone_last4?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rule_sets: {
        Row: {
          active: boolean;
          checksum: string;
          created_at: string;
          published_at: string;
          rule_bundle: Json;
          version: string;
        };
        Insert: {
          active?: boolean;
          checksum: string;
          created_at?: string;
          published_at?: string;
          rule_bundle: Json;
          version: string;
        };
        Update: {
          active?: boolean;
          checksum?: string;
          created_at?: string;
          published_at?: string;
          rule_bundle?: Json;
          version?: string;
        };
        Relationships: [];
      };
      scan_feedback: {
        Row: {
          created_at: string;
          event_id: string | null;
          expected_level: Database['public']['Enums']['threat_level'];
          id: string;
          indicator_codes: string[];
          rule_version: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id?: string | null;
          expected_level: Database['public']['Enums']['threat_level'];
          id?: string;
          indicator_codes?: string[];
          rule_version: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string | null;
          expected_level?: Database['public']['Enums']['threat_level'];
          id?: string;
          indicator_codes?: string[];
          rule_version?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'scan_feedback_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'threat_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'scan_feedback_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      threat_events: {
        Row: {
          blocked: boolean;
          client_event_id: string;
          device_id: string;
          id: string;
          indicator_codes: string[];
          is_demo: boolean;
          occurred_at: string;
          received_at: string;
          rule_version: string;
          score_bucket: number;
          source: Database['public']['Enums']['threat_source'];
          threat_level: Database['public']['Enums']['threat_level'];
          url_count: number;
          user_id: string;
        };
        Insert: {
          blocked?: boolean;
          client_event_id: string;
          device_id: string;
          id?: string;
          indicator_codes?: string[];
          is_demo?: boolean;
          occurred_at?: string;
          received_at?: string;
          rule_version: string;
          score_bucket: number;
          source: Database['public']['Enums']['threat_source'];
          threat_level: Database['public']['Enums']['threat_level'];
          url_count?: number;
          user_id: string;
        };
        Update: {
          blocked?: boolean;
          client_event_id?: string;
          device_id?: string;
          id?: string;
          indicator_codes?: string[];
          is_demo?: boolean;
          occurred_at?: string;
          received_at?: string;
          rule_version?: string;
          score_bucket?: number;
          source?: Database['public']['Enums']['threat_source'];
          threat_level?: Database['public']['Enums']['threat_level'];
          url_count?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'threat_events_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'threat_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      assert_indicator_codes: {
        Args: { p_codes: string[] | null; p_rule_version: string };
        Returns: undefined;
      };
      get_community_stats: {
        Args: { p_range: CommunityRange };
        Returns: {
          blocked_count: number;
          dangerous_count: number;
          date: string;
          safe_count: number;
          suspicious_count: number;
        }[];
      };
      record_threat_event: {
        Args: {
          p_blocked: boolean;
          p_client_event_id: string;
          p_device_id: string;
          p_indicator_codes: string[] | null;
          p_is_demo?: boolean;
          p_occurred_at: string;
          p_rule_version: string;
          p_score_bucket: number;
          p_source: Database['public']['Enums']['threat_source'];
          p_threat_level: Database['public']['Enums']['threat_level'];
          p_url_count: number;
        };
        Returns: string;
      };
      register_device: {
        Args: {
          p_app_version: string;
          p_installation_id: string;
          p_rule_version: string;
        };
        Returns: Database['public']['Tables']['devices']['Row'];
      };
      submit_scan_feedback: {
        Args: {
          p_event_id: string | null;
          p_expected_level: Database['public']['Enums']['threat_level'];
          p_indicator_codes: string[] | null;
          p_rule_version: string;
        };
        Returns: string;
      };
    };
    Enums: {
      threat_level: 'safe' | 'suspicious' | 'dangerous';
      threat_source: 'realtime' | 'manual';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Device = Database['public']['Tables']['devices']['Row'];
export type ThreatEvent = Database['public']['Tables']['threat_events']['Row'];
export type ScanFeedback = Database['public']['Tables']['scan_feedback']['Row'];
