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
      homework_entries: {
        Row: {
          display_date: string
          entry_id: string
          hold: string
          id: string
          items_json: Json | null
          lesson_date: string
          note: string | null
          room: string | null
          source_updated_at: string | null
          status: string | null
          teacher: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          display_date: string
          entry_id: string
          hold: string
          id?: string
          items_json?: Json | null
          lesson_date: string
          note?: string | null
          room?: string | null
          source_updated_at?: string | null
          status?: string | null
          teacher?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          display_date?: string
          entry_id?: string
          hold?: string
          id?: string
          items_json?: Json | null
          lesson_date?: string
          note?: string | null
          room?: string | null
          source_updated_at?: string | null
          status?: string | null
          teacher?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lesson_mappings: {
        Row: {
          created_at: string | null
          default_color: string
          full_name: string
          gym_id: string
          id: string
          original_string: string
        }
        Insert: {
          created_at?: string | null
          default_color: string
          full_name: string
          gym_id: string
          id?: string
          original_string: string
        }
        Update: {
          created_at?: string | null
          default_color?: string
          full_name?: string
          gym_id?: string
          id?: string
          original_string?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          content: Json | null
          created_at: string
          end_time: string
          homework: string | null
          id: string
          lesson_date: string
          lesson_key: string
          notes: string | null
          room: string | null
          source_updated_at: string
          start_time: string
          status: string
          teacher: string | null
          title: string
          updated_at: string
          week_key: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          end_time: string
          homework?: string | null
          id?: string
          lesson_date: string
          lesson_key: string
          notes?: string | null
          room?: string | null
          source_updated_at?: string
          start_time: string
          status?: string
          teacher?: string | null
          title: string
          updated_at?: string
          week_key: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          end_time?: string
          homework?: string | null
          id?: string
          lesson_date?: string
          lesson_key?: string
          notes?: string | null
          room?: string | null
          source_updated_at?: string
          start_time?: string
          status?: string
          teacher?: string | null
          title?: string
          updated_at?: string
          week_key?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      student_homework: {
        Row: {
          done_updated_at: string
          homework_id: string
          is_done: boolean
          student_id: string
          updated_at: string
        }
        Insert: {
          done_updated_at?: string
          homework_id: string
          is_done?: boolean
          student_id: string
          updated_at?: string
        }
        Update: {
          done_updated_at?: string
          homework_id?: string
          is_done?: boolean
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_homework_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      student_lessoncontrols: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          mapping_id: string | null
          new_name: string | null
          student_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          mapping_id?: string | null
          new_name?: string | null
          student_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          mapping_id?: string | null
          new_name?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_lessoncontrols_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "lesson_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      student_lessons: {
        Row: {
          lesson_id: string
          student_id: string
        }
        Insert: {
          lesson_id: string
          student_id: string
        }
        Update: {
          lesson_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_lessons_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          birthdate: string | null
          created_at: string
          custom_pfp_url: string | null
          description: string | null
          has_app: boolean
          has_extension: boolean
          id: string
          instagram: string | null
          lectio_pfp_url: string | null
          name: string | null
          school_id: number
        }
        Insert: {
          birthdate?: string | null
          created_at?: string
          custom_pfp_url?: string | null
          description?: string | null
          has_app?: boolean
          has_extension?: boolean
          id: string
          instagram?: string | null
          lectio_pfp_url?: string | null
          name?: string | null
          school_id: number
        }
        Update: {
          birthdate?: string | null
          created_at?: string
          custom_pfp_url?: string | null
          description?: string | null
          has_app?: boolean
          has_extension?: boolean
          id?: string
          instagram?: string | null
          lectio_pfp_url?: string | null
          name?: string | null
          school_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      updates: {
        Row: {
          changed_at: string | null
          column_changed: string
          id: string
          new_state: Json | null
          old_state: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          changed_at?: string | null
          column_changed: string
          id?: string
          new_state?: Json | null
          old_state?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          changed_at?: string | null
          column_changed?: string
          id?: string
          new_state?: Json | null
          old_state?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      week_sync: {
        Row: {
          created_at: string
          id: string
          last_synced_at: string
          student_id: string
          updated_at: string
          week_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_synced_at?: string
          student_id: string
          updated_at?: string
          week_key: string
        }
        Update: {
          created_at?: string
          id?: string
          last_synced_at?: string
          student_id?: string
          updated_at?: string
          week_key?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_student_lesson_mappings: {
        Args: { p_gym_id: string; p_student_id: string }
        Returns: {
          default_color: string
          display_color: string
          display_name: string
          full_name: string
          is_overwritten: boolean
          mapping_id: string
          original_string: string
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
