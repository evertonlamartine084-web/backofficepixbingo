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
      batch_items: {
        Row: {
          batch_id: string
          cpf: string
          cpf_masked: string
          created_at: string
          datas_bonus: Json | null
          id: string
          log: Json | null
          qtd_bonus: number
          status: string
          tentativas: number
          ultima_data_bonus: string | null
          updated_at: string
          uuid: string | null
        }
        Insert: {
          batch_id: string
          cpf: string
          cpf_masked: string
          created_at?: string
          datas_bonus?: Json | null
          id?: string
          log?: Json | null
          qtd_bonus?: number
          status?: string
          tentativas?: number
          ultima_data_bonus?: string | null
          updated_at?: string
          uuid?: string | null
        }
        Update: {
          batch_id?: string
          cpf?: string
          cpf_masked?: string
          created_at?: string
          datas_bonus?: Json | null
          id?: string
          log?: Json | null
          qtd_bonus?: number
          status?: string
          tentativas?: number
          ultima_data_bonus?: string | null
          updated_at?: string
          uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          bonus_valor: number
          created_at: string
          flow_id: string | null
          flow_name: string | null
          id: string
          name: string
          processed: number
          stats: Json
          status: string
          total_items: number
          updated_at: string
        }
        Insert: {
          bonus_valor?: number
          created_at?: string
          flow_id?: string | null
          flow_name?: string | null
          id?: string
          name: string
          processed?: number
          stats?: Json
          status?: string
          total_items?: number
          updated_at?: string
        }
        Update: {
          bonus_valor?: number
          created_at?: string
          flow_id?: string | null
          flow_name?: string | null
          id?: string
          name?: string
          processed?: number
          stats?: Json
          status?: string
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_audit: {
        Row: {
          batch_item_id: string
          created_at: string
          datas_bonus: Json | null
          id: string
          qtd_bonus: number
          raw_matches: Json | null
          ultima_data_bonus: string | null
        }
        Insert: {
          batch_item_id: string
          created_at?: string
          datas_bonus?: Json | null
          id?: string
          qtd_bonus?: number
          raw_matches?: Json | null
          ultima_data_bonus?: string | null
        }
        Update: {
          batch_item_id?: string
          created_at?: string
          datas_bonus?: Json | null
          id?: string
          qtd_bonus?: number
          raw_matches?: Json | null
          ultima_data_bonus?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bonus_audit_batch_item_id_fkey"
            columns: ["batch_item_id"]
            isOneToOne: false
            referencedRelation: "batch_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_rules: {
        Row: {
          active: boolean | null
          created_at: string
          date_fields: Json | null
          field_candidates: Json | null
          id: string
          keywords: Json | null
          name: string
          valor_fixo: number | null
          valor_positivo: boolean | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          date_fields?: Json | null
          field_candidates?: Json | null
          id?: string
          keywords?: Json | null
          name: string
          valor_fixo?: number | null
          valor_positivo?: boolean | null
        }
        Update: {
          active?: boolean | null
          created_at?: string
          date_fields?: Json | null
          field_candidates?: Json | null
          id?: string
          keywords?: Json | null
          name?: string
          valor_fixo?: number | null
          valor_positivo?: boolean | null
        }
        Relationships: []
      }
      campaign_participants: {
        Row: {
          campaign_id: string
          cpf: string
          cpf_masked: string
          created_at: string
          credit_result: string | null
          id: string
          prize_credited: boolean
          status: string
          total_value: number
          updated_at: string
          uuid: string | null
        }
        Insert: {
          campaign_id: string
          cpf: string
          cpf_masked: string
          created_at?: string
          credit_result?: string | null
          id?: string
          prize_credited?: boolean
          status?: string
          total_value?: number
          updated_at?: string
          uuid?: string | null
        }
        Update: {
          campaign_id?: string
          cpf?: string
          cpf_masked?: string
          created_at?: string
          credit_result?: string | null
          id?: string
          prize_credited?: boolean
          status?: string
          total_value?: number
          updated_at?: string
          uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_participants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          description: string | null
          end_date: string
          id: string
          min_value: number
          name: string
          prize_description: string | null
          prize_value: number
          segment_id: string | null
          start_date: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          min_value?: number
          name: string
          prize_description?: string | null
          prize_value?: number
          segment_id?: string | null
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          min_value?: number
          name?: string
          prize_description?: string | null
          prize_value?: number
          segment_id?: string | null
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          created_at: string
          id: string
          name: string
          type: string
          updated_at: string
          value_encrypted: string
          value_masked: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type?: string
          updated_at?: string
          value_encrypted: string
          value_masked: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: string
          updated_at?: string
          value_encrypted?: string
          value_masked?: string
        }
        Relationships: []
      }
      endpoints: {
        Row: {
          auth_type: string
          body_template: string | null
          cookies: Json | null
          created_at: string
          credential_id: string | null
          description: string | null
          headers: Json | null
          id: string
          method: string
          name: string
          query_params: Json | null
          rate_limit_concurrency: number
          rate_limit_rps: number
          response_mapping: Json | null
          retry_backoff_ms: number
          retry_codes: Json | null
          retry_max: number
          timeout_ms: number
          url: string
        }
        Insert: {
          auth_type?: string
          body_template?: string | null
          cookies?: Json | null
          created_at?: string
          credential_id?: string | null
          description?: string | null
          headers?: Json | null
          id?: string
          method?: string
          name: string
          query_params?: Json | null
          rate_limit_concurrency?: number
          rate_limit_rps?: number
          response_mapping?: Json | null
          retry_backoff_ms?: number
          retry_codes?: Json | null
          retry_max?: number
          timeout_ms?: number
          url: string
        }
        Update: {
          auth_type?: string
          body_template?: string | null
          cookies?: Json | null
          created_at?: string
          credential_id?: string | null
          description?: string | null
          headers?: Json | null
          id?: string
          method?: string
          name?: string
          query_params?: Json | null
          rate_limit_concurrency?: number
          rate_limit_rps?: number
          response_mapping?: Json | null
          retry_backoff_ms?: number
          retry_codes?: Json | null
          retry_max?: number
          timeout_ms?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoints_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      external_requests_log: {
        Row: {
          batch_item_id: string | null
          created_at: string
          duration_ms: number | null
          endpoint_id: string | null
          error: string | null
          id: string
          method: string | null
          request_hash: string | null
          response_hash: string | null
          status_code: number | null
          url: string | null
        }
        Insert: {
          batch_item_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint_id?: string | null
          error?: string | null
          id?: string
          method?: string | null
          request_hash?: string | null
          response_hash?: string | null
          status_code?: number | null
          url?: string | null
        }
        Update: {
          batch_item_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint_id?: string | null
          error?: string | null
          id?: string
          method?: string | null
          request_hash?: string | null
          response_hash?: string | null
          status_code?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_requests_log_batch_item_id_fkey"
            columns: ["batch_item_id"]
            isOneToOne: false
            referencedRelation: "batch_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_requests_log_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          steps: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          steps?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          steps?: Json
        }
        Relationships: []
      }
      segment_items: {
        Row: {
          cpf: string
          cpf_masked: string
          created_at: string
          id: string
          segment_id: string
        }
        Insert: {
          cpf: string
          cpf_masked: string
          created_at?: string
          id?: string
          segment_id: string
        }
        Update: {
          cpf?: string
          cpf_masked?: string
          created_at?: string
          id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_items_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operador" | "visualizador"
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
    Enums: {
      app_role: ["admin", "operador", "visualizador"],
    },
  },
} as const
