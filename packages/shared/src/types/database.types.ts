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
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      availability: {
        Row: {
          city_id: string
          constraints: string[]
          created_at: string
          end_date: string
          id: string
          max_nights: number | null
          note: string | null
          offers: string[]
          profile_id: string
          start_date: string
          status: Database["public"]["Enums"]["availability_status"]
          updated_at: string
        }
        Insert: {
          city_id: string
          constraints?: string[]
          created_at?: string
          end_date: string
          id?: string
          max_nights?: number | null
          note?: string | null
          offers?: string[]
          profile_id: string
          start_date: string
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Update: {
          city_id?: string
          constraints?: string[]
          created_at?: string
          end_date?: string
          id?: string
          max_nights?: number | null
          note?: string | null
          offers?: string[]
          profile_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      cities: {
        Row: {
          aliases: string[]
          country_code: string
          geoname_id: number | null
          id: string
          is_active: boolean
          lat: number
          lon: number
          name: string
          name_local: string | null
          population: number
        }
        Insert: {
          aliases?: string[]
          country_code: string
          geoname_id?: number | null
          id?: string
          is_active?: boolean
          lat: number
          lon: number
          name: string
          name_local?: string | null
          population?: number
        }
        Update: {
          aliases?: string[]
          country_code?: string
          geoname_id?: number | null
          id?: string
          is_active?: boolean
          lat?: number
          lon?: number
          name?: string
          name_local?: string | null
          population?: number
        }
        Relationships: []
      }
      contact_details: {
        Row: {
          email: string | null
          phone: string | null
          preferred_channel: string | null
          profile_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          email?: string | null
          phone?: string | null
          preferred_channel?: string | null
          profile_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          email?: string | null
          phone?: string | null
          preferred_channel?: string | null
          profile_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      contact_grants: {
        Row: {
          created_at: string
          id: string
          profile_a: string
          profile_b: string
          source: string
          source_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          profile_a: string
          profile_b: string
          source: string
          source_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          profile_a?: string
          profile_b?: string
          source?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_grants_profile_a_fkey"
            columns: ["profile_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_grants_profile_a_fkey"
            columns: ["profile_a"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_grants_profile_a_fkey"
            columns: ["profile_a"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "contact_grants_profile_b_fkey"
            columns: ["profile_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_grants_profile_b_fkey"
            columns: ["profile_b"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_grants_profile_b_fkey"
            columns: ["profile_b"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      data_exports: {
        Row: {
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_exports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_exports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_exports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      invite_redemptions: {
        Row: {
          id: string
          invite_id: string
          redeemed_at: string
          redeemed_by: string
        }
        Insert: {
          id?: string
          invite_id: string
          redeemed_at?: string
          redeemed_by: string
        }
        Update: {
          id?: string
          invite_id?: string
          redeemed_at?: string
          redeemed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_redemptions_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_redemptions_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_redemptions_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: true
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_redemptions_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: true
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          max_uses: number
          revoked_at: string | null
          uses: number
        }
        Insert: {
          code?: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          created_at: string
          email_fallback_sent_at: string | null
          expo_receipt_id: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          profile_id: string
          read_at: string | null
          receipt_checked_at: string | null
          receipt_ok: boolean | null
          sent_at: string | null
          type: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          email_fallback_sent_at?: string | null
          expo_receipt_id?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          profile_id: string
          read_at?: string | null
          receipt_checked_at?: string | null
          receipt_ok?: boolean | null
          sent_at?: string | null
          type: string
        }
        Update: {
          attempts?: number
          created_at?: string
          email_fallback_sent_at?: string | null
          expo_receipt_id?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          profile_id?: string
          read_at?: string | null
          receipt_checked_at?: string | null
          receipt_ok?: boolean | null
          sent_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      offers: {
        Row: {
          auto_declined: boolean
          city_id: string | null
          created_at: string
          end_date: string
          from_profile: string
          id: string
          message: string | null
          request_id: string | null
          responded_at: string | null
          start_date: string
          status: Database["public"]["Enums"]["offer_status"]
          to_profile: string
          trip_id: string
        }
        Insert: {
          auto_declined?: boolean
          city_id?: string | null
          created_at?: string
          end_date: string
          from_profile: string
          id?: string
          message?: string | null
          request_id?: string | null
          responded_at?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["offer_status"]
          to_profile: string
          trip_id: string
        }
        Update: {
          auto_declined?: boolean
          city_id?: string | null
          created_at?: string
          end_date?: string
          from_profile?: string
          id?: string
          message?: string | null
          request_id?: string | null
          responded_at?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["offer_status"]
          to_profile?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_from_profile_fkey"
            columns: ["from_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_from_profile_fkey"
            columns: ["from_profile"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_from_profile_fkey"
            columns: ["from_profile"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "offers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "offers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          discipline: string
          display_name: string
          home_city_id: string | null
          home_district: string | null
          id: string
          invite_quota: number
          invited_by: string | null
          links: Json
          photo_path: string | null
          specialisation: string | null
          status: Database["public"]["Enums"]["profile_status"]
          suspended_at: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          discipline: string
          display_name: string
          home_city_id?: string | null
          home_district?: string | null
          id: string
          invite_quota?: number
          invited_by?: string | null
          links?: Json
          photo_path?: string | null
          specialisation?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          suspended_at?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          discipline?: string
          display_name?: string
          home_city_id?: string | null
          home_district?: string | null
          id?: string
          invite_quota?: number
          invited_by?: string | null
          links?: Json
          photo_path?: string | null
          specialisation?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          suspended_at?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_home_city_id_fkey"
            columns: ["home_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          invalidated_at: string | null
          last_seen_at: string
          platform: string
          profile_id: string
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          invalidated_at?: string | null
          last_seen_at?: string
          platform: string
          profile_id: string
          token: string
        }
        Update: {
          created_at?: string
          id?: string
          invalidated_at?: string | null
          last_seen_at?: string
          platform?: string
          profile_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      reports: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          moderator_note: string | null
          related_id: string | null
          related_type: string | null
          reporter_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          subject_id: string | null
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          id?: string
          moderator_note?: string | null
          related_id?: string | null
          related_type?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          subject_id?: string | null
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          moderator_note?: string | null
          related_id?: string | null
          related_type?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reports_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      requests: {
        Row: {
          created_at: string
          from_profile: string
          id: string
          kind: Database["public"]["Enums"]["request_kind"]
          message: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["request_status"]
          to_profile: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          from_profile: string
          id?: string
          kind: Database["public"]["Enums"]["request_kind"]
          message?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          to_profile: string
          trip_id: string
        }
        Update: {
          created_at?: string
          from_profile?: string
          id?: string
          kind?: Database["public"]["Enums"]["request_kind"]
          message?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          to_profile?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_from_profile_fkey"
            columns: ["from_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_from_profile_fkey"
            columns: ["from_profile"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_from_profile_fkey"
            columns: ["from_profile"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "requests_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_to_profile_fkey"
            columns: ["to_profile"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "requests_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string | null
          body: string | null
          id: string
          published_at: string | null
          stay_id: string
          subject_id: string
          submitted_at: string
          would_again: boolean
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          id?: string
          published_at?: string | null
          stay_id: string
          subject_id: string
          submitted_at?: string
          would_again: boolean
        }
        Update: {
          author_id?: string | null
          body?: string | null
          id?: string
          published_at?: string | null
          stay_id?: string
          subject_id?: string
          submitted_at?: string
          would_again?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reviews_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      stays: {
        Row: {
          city_id: string
          created_at: string
          end_date: string
          guest_id: string
          host_id: string
          id: string
          offer_id: string
          prompted_at: string | null
          reminded_at: string | null
          review_closes_at: string | null
          start_date: string
        }
        Insert: {
          city_id: string
          created_at?: string
          end_date: string
          guest_id: string
          host_id: string
          id?: string
          offer_id: string
          prompted_at?: string | null
          reminded_at?: string | null
          review_closes_at?: string | null
          start_date: string
        }
        Update: {
          city_id?: string
          created_at?: string
          end_date?: string
          guest_id?: string
          host_id?: string
          id?: string
          offer_id?: string
          prompted_at?: string | null
          reminded_at?: string | null
          review_closes_at?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "stays_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "stays_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "stays_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: true
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          city_id: string
          created_at: string
          end_date: string
          id: string
          needs: string[]
          note: string | null
          profile_id: string
          start_date: string
          status: Database["public"]["Enums"]["trip_status"]
          updated_at: string
        }
        Insert: {
          city_id: string
          created_at?: string
          end_date: string
          id?: string
          needs?: string[]
          note?: string | null
          profile_id: string
          start_date: string
          status?: Database["public"]["Enums"]["trip_status"]
          updated_at?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          end_date?: string
          id?: string
          needs?: string[]
          note?: string | null
          profile_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["trip_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      verification_applications: {
        Row: {
          decision_reason: string | null
          doc_paths: string[]
          docs_deleted_at: string | null
          docs_deletion_requested_at: string | null
          id: string
          links: Json
          note: string | null
          profile_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["verification_status"]
          submitted_at: string
        }
        Insert: {
          decision_reason?: string | null
          doc_paths?: string[]
          docs_deleted_at?: string | null
          docs_deletion_requested_at?: string | null
          id?: string
          links?: Json
          note?: string | null
          profile_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string
        }
        Update: {
          decision_reason?: string | null
          doc_paths?: string[]
          docs_deleted_at?: string | null
          docs_deletion_requested_at?: string | null
          id?: string
          links?: Json
          note?: string | null
          profile_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "verification_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
    }
    Views: {
      v_docs_awaiting_purge: {
        Row: {
          application_id: string | null
          doc_paths: string[] | null
          docs_deletion_requested_at: string | null
          seconds_waiting: number | null
          status: Database["public"]["Enums"]["verification_status"] | null
        }
        Insert: {
          application_id?: string | null
          doc_paths?: string[] | null
          docs_deletion_requested_at?: string | null
          seconds_waiting?: never
          status?: Database["public"]["Enums"]["verification_status"] | null
        }
        Update: {
          application_id?: string | null
          doc_paths?: string[] | null
          docs_deletion_requested_at?: string | null
          seconds_waiting?: never
          status?: Database["public"]["Enums"]["verification_status"] | null
        }
        Relationships: []
      }
      v_notification_health: {
        Row: {
          confirmed: number | null
          emailed: number | null
          exhausted: number | null
          failing: number | null
          latest: string | null
          sent: number | null
          total: number | null
          type: string | null
        }
        Relationships: []
      }
      v_open_reports: {
        Row: {
          body: string | null
          category: string | null
          created_at: string | null
          days_open: number | null
          related_id: string | null
          related_type: string | null
          report_id: string | null
          reporter_id: string | null
          reporter_name: string | null
          status: Database["public"]["Enums"]["report_status"] | null
          subject_id: string | null
          subject_name: string | null
          subject_prior_reporters: number | null
          subject_prior_reports: number | null
          subject_status: Database["public"]["Enums"]["profile_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reports_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      v_pending_verifications: {
        Row: {
          application_id: string | null
          days_waiting: number | null
          discipline: string | null
          display_name: string | null
          doc_paths: string[] | null
          email: string | null
          links: Json | null
          note: string | null
          specialisation: string | null
          submitted_at: string | null
        }
        Relationships: []
      }
      v_recent_signups: {
        Row: {
          created_at: string | null
          discipline: string | null
          display_name: string | null
          home_city: string | null
          id: string | null
          invited_by: string | null
          joined_via: string | null
          status: Database["public"]["Enums"]["profile_status"] | null
        }
        Relationships: []
      }
      v_stuck_notifications: {
        Row: {
          attempts: number | null
          created_at: string | null
          display_name: string | null
          email_fallback_sent_at: string | null
          id: string | null
          last_error: string | null
          next_attempt_at: string | null
          profile_id: string | null
          seconds_waiting: number | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_recent_signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "v_user_summary"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      v_user_summary: {
        Row: {
          availability: number | null
          blocks_made: number | null
          blocks_received: number | null
          discipline: string | null
          display_name: string | null
          distinct_reporters: number | null
          home_city: string | null
          invited_by: string | null
          invites_created: number | null
          joined_at: string | null
          profile_id: string | null
          reports_filed: number | null
          reports_received: number | null
          reviews_received: number | null
          reviews_written: number | null
          status: Database["public"]["Enums"]["profile_status"] | null
          stays_as_guest: number | null
          stays_hosted: number | null
          trips: number | null
          would_again_pct: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_co_request: {
        Args: { p_request_id: string; p_user: string }
        Returns: Json
      }
      accept_offer: {
        Args: { p_offer_id: string; p_user: string }
        Returns: Json
      }
      are_blocked: { Args: { a: string; b: string }; Returns: boolean }
      call_edge_function: {
        Args: { fn_name: string; payload?: Json }
        Returns: number
      }
      claim_notification_emails: {
        Args: { p_limit?: number }
        Returns: {
          email: string
          id: string
          payload: Json
          profile_id: string
        }[]
      }
      claim_notification_receipts: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          email_fallback_sent_at: string | null
          expo_receipt_id: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          profile_id: string
          read_at: string | null
          receipt_checked_at: string | null
          receipt_ok: boolean | null
          sent_at: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_notifications: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          email_fallback_sent_at: string | null
          expo_receipt_id: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          profile_id: string
          read_at: string | null
          receipt_checked_at: string | null
          receipt_ok: boolean | null
          sent_at: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      config_int: { Args: { config_key: string }; Returns: number }
      current_status: {
        Args: never
        Returns: Database["public"]["Enums"]["profile_status"]
      }
      delete_account: { Args: { p_user: string }; Returns: Json }
      display_name_of: { Args: { p_profile_id: string }; Returns: string }
      distance_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      enqueue_notification: {
        Args: { p_payload?: Json; p_profile_id: string; p_type: string }
        Returns: string
      }
      expire_stale_requests_and_offers: { Args: never; Returns: number }
      expire_verification_docs: { Args: never; Returns: number }
      export_user_data: { Args: { p_user: string }; Returns: Json }
      generate_invite_code: { Args: never; Returns: string }
      has_contact_grant: { Args: { other: string }; Returns: boolean }
      is_approved: { Args: never; Returns: boolean }
      is_blocked: { Args: { other: string }; Returns: boolean }
      live_invite_count: { Args: never; Returns: number }
      notification_stay_payload: { Args: { p_stay_id: string }; Returns: Json }
      notification_trip_payload: { Args: { p_trip_id: string }; Returns: Json }
      offerable_windows: {
        Args: { p_trip_id: string }
        Returns: {
          availability_id: string
          city_id: string
          city_name: string
          distance_km: number
          max_nights: number
          window_end: string
          window_start: string
        }[]
      }
      prompt_reviews: { Args: never; Returns: number }
      publish_reviews_for_stay: { Args: { p_stay_id: string }; Returns: number }
      recent_export_count: { Args: { p_user: string }; Returns: number }
      recent_report_count: { Args: { p_reporter: string }; Returns: number }
      record_notification_receipts: {
        Args: { p_results: Json }
        Returns: number
      }
      record_notification_results: {
        Args: { p_results: Json }
        Returns: number
      }
      redeem_invite: { Args: { p_code: string; p_user: string }; Returns: Json }
      release_reviews: { Args: never; Returns: number }
      remaining_invite_quota: { Args: never; Returns: number }
      remind_reviews: { Args: never; Returns: number }
      review_summary: {
        Args: { p_profile_id: string }
        Returns: {
          total: number
          would_again: number
        }[]
      }
      search_cities: {
        Args: { max_results?: number; q: string }
        Returns: {
          country_code: string
          id: string
          name: string
          name_local: string
          population: number
        }[]
      }
      search_matches: { Args: { p_trip_id: string }; Returns: Json }
      search_open_trips: {
        Args: never
        Returns: {
          already_asked: boolean
          already_offered: boolean
          city_id: string
          city_name: string
          discipline: string
          display_name: string
          distance_km: number
          needs: string[]
          note: string
          overlap_end: string
          overlap_nights: number
          overlap_start: string
          photo_path: string
          profile_id: string
          specialisation: string
          trip_end: string
          trip_id: string
          trip_start: string
        }[]
      }
      submit_report: {
        Args: {
          p_also_block?: boolean
          p_body: string
          p_category: string
          p_related_id?: string
          p_related_type?: string
          p_reporter: string
          p_subject: string
        }
        Returns: Json
      }
      trip_request_count: { Args: { p_trip_id: string }; Returns: number }
    }
    Enums: {
      availability_status: "active" | "cancelled"
      offer_status:
        | "pending"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
      profile_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
        | "deleted"
      report_status: "open" | "reviewing" | "actioned" | "dismissed"
      request_kind: "host_stay" | "co_accommodation"
      request_status:
        | "pending"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
      trip_status: "active" | "cancelled" | "completed"
      verification_status: "pending" | "approved" | "rejected" | "docs_expired"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      availability_status: ["active", "cancelled"],
      offer_status: ["pending", "accepted", "declined", "withdrawn", "expired"],
      profile_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
        "deleted",
      ],
      report_status: ["open", "reviewing", "actioned", "dismissed"],
      request_kind: ["host_stay", "co_accommodation"],
      request_status: [
        "pending",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
      ],
      trip_status: ["active", "cancelled", "completed"],
      verification_status: ["pending", "approved", "rejected", "docs_expired"],
    },
  },
} as const
