export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
            foreignKeyName: "contact_grants_profile_b_fkey"
            columns: ["profile_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            foreignKeyName: "verification_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      config_int: { Args: { config_key: string }; Returns: number }
      current_status: {
        Args: never
        Returns: Database["public"]["Enums"]["profile_status"]
      }
      generate_invite_code: { Args: never; Returns: string }
      has_contact_grant: { Args: { other: string }; Returns: boolean }
      is_approved: { Args: never; Returns: boolean }
      is_blocked: { Args: { other: string }; Returns: boolean }
      live_invite_count: { Args: never; Returns: number }
      redeem_invite: { Args: { p_code: string; p_user: string }; Returns: Json }
      remaining_invite_quota: { Args: never; Returns: number }
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
    }
    Enums: {
      profile_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
        | "deleted"
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
      profile_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
        "deleted",
      ],
      verification_status: ["pending", "approved", "rejected", "docs_expired"],
    },
  },
} as const

