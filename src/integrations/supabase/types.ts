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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_analyses: {
        Row: {
          analysis_text: string
          created_at: string | null
          data_timestamp: string
          id: string
          language: string
          sensor_data_snapshot: Json | null
          station_id: string | null
        }
        Insert: {
          analysis_text: string
          created_at?: string | null
          data_timestamp: string
          id?: string
          language: string
          sensor_data_snapshot?: Json | null
          station_id?: string | null
        }
        Update: {
          analysis_text?: string
          created_at?: string | null
          data_timestamp?: string
          id?: string
          language?: string
          sensor_data_snapshot?: Json | null
          station_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analyses_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "sensor_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_fetch_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          fetch_completed_at: string | null
          fetch_started_at: string
          id: string
          readings_count: number | null
          station_id: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          fetch_completed_at?: string | null
          fetch_started_at: string
          id?: string
          readings_count?: number | null
          station_id?: string | null
          status: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          fetch_completed_at?: string | null
          fetch_started_at?: string
          id?: string
          readings_count?: number | null
          station_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_fetch_log_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "sensor_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_calibration_offsets: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          offset_value: number
          reason: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          offset_value: number
          reason: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          offset_value?: number
          reason?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensor_calibration_offsets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "sensor_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_channels: {
        Row: {
          category: string | null
          channel_name: string
          created_at: string | null
          id: string
          is_active: boolean | null
          precision: number | null
          sensor_name: string | null
          station_id: string | null
          stevens_channel_id: number
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          channel_name: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          precision?: number | null
          sensor_name?: string | null
          station_id?: string | null
          stevens_channel_id: number
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          channel_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          precision?: number | null
          sensor_name?: string | null
          station_id?: string | null
          stevens_channel_id?: number
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensor_channels_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "sensor_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_readings: {
        Row: {
          channel_id: string | null
          created_at: string | null
          id: string
          measured_at: string
          value: number
        }
        Insert: {
          channel_id?: string | null
          created_at?: string | null
          id?: string
          measured_at: string
          value: number
        }
        Update: {
          channel_id?: string | null
          created_at?: string | null
          id?: string
          measured_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "sensor_readings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "sensor_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_stations: {
        Row: {
          created_at: string | null
          id: string
          location: string | null
          project_id: number | null
          station_code: string | null
          station_name: string
          stevens_station_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          location?: string | null
          project_id?: number | null
          station_code?: string | null
          station_name: string
          stevens_station_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          location?: string | null
          project_id?: number | null
          station_code?: string | null
          station_name?: string
          stevens_station_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_dashboard_data: { Args: { p_language?: string }; Returns: Json }
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
