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
          school_id: number | null
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
          school_id?: number | null
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
          school_id?: number | null
          source_updated_at?: string | null
          status?: string | null
          teacher?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_entries_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      school_lesson_mappings: {
        Row: {
          canonical_key: string
          created_at: string
          default_color_hue: number | null
          default_name: string
          deleted_at: string | null
          icon: string | null
          id: string
          school_id: number
          updated_at: string
        }
        Insert: {
          canonical_key: string
          created_at?: string
          default_color_hue?: number | null
          default_name: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          school_id: number
          updated_at?: string
        }
        Update: {
          canonical_key?: string
          created_at?: string
          default_color_hue?: number | null
          default_name?: string
          deleted_at?: string | null
          icon?: string | null
          id?: string
          school_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_lesson_mappings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          display_name: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      student_homework: {
        Row: {
          client_updated_at: string | null
          done_updated_at: string
          homework_id: string
          is_done: boolean
          last_modified_by: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          client_updated_at?: string | null
          done_updated_at?: string
          homework_id: string
          is_done?: boolean
          last_modified_by?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          client_updated_at?: string | null
          done_updated_at?: string
          homework_id?: string
          is_done?: boolean
          last_modified_by?: string | null
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
          {
            foreignKeyName: "student_homework_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          {
            foreignKeyName: "student_lessoncontrols_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          {
            foreignKeyName: "student_lessons_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          app_eligible: boolean
          app_installed_at: string | null
          app_qr_scanned_at: string | null
          birthdate: string | null
          class_name: string | null
          created_at: string
          custom_pfp_url: string | null
          description: string | null
          dismissed_app_prompt_at: string | null
          extension_installed_at: string | null
          id: string
          instagram: string | null
          lectio_first_name: string | null
          lectio_last_name: string | null
          lectio_pfp_url: string | null
          marked_android_at: string | null
          name: string | null
          pfp_hash: string | null
          school_id: number
          show_birthday: boolean
          supabase_id: string
        }
        Insert: {
          app_eligible?: boolean
          app_installed_at?: string | null
          app_qr_scanned_at?: string | null
          birthdate?: string | null
          class_name?: string | null
          created_at?: string
          custom_pfp_url?: string | null
          description?: string | null
          dismissed_app_prompt_at?: string | null
          extension_installed_at?: string | null
          id: string
          instagram?: string | null
          lectio_first_name?: string | null
          lectio_last_name?: string | null
          lectio_pfp_url?: string | null
          marked_android_at?: string | null
          name?: string | null
          pfp_hash?: string | null
          school_id: number
          show_birthday?: boolean
          supabase_id: string
        }
        Update: {
          app_eligible?: boolean
          app_installed_at?: string | null
          app_qr_scanned_at?: string | null
          birthdate?: string | null
          class_name?: string | null
          created_at?: string
          custom_pfp_url?: string | null
          description?: string | null
          dismissed_app_prompt_at?: string | null
          extension_installed_at?: string | null
          id?: string
          instagram?: string | null
          lectio_first_name?: string | null
          lectio_last_name?: string | null
          lectio_pfp_url?: string | null
          marked_android_at?: string | null
          name?: string | null
          pfp_hash?: string | null
          school_id?: number
          show_birthday?: boolean
          supabase_id?: string
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
      user_lesson_overrides: {
        Row: {
          client_updated_at: string | null
          color_hue: number | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          icon: string | null
          id: string
          last_modified_by: string | null
          mapping_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          client_updated_at?: string | null
          color_hue?: number | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          icon?: string | null
          id?: string
          last_modified_by?: string | null
          mapping_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          client_updated_at?: string | null
          color_hue?: number | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          icon?: string | null
          id?: string
          last_modified_by?: string | null
          mapping_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_lesson_overrides_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "school_lesson_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_lesson_overrides_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "week_sync_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_school_id: { Args: never; Returns: number }
      get_student_homework_statuses: {
        Args: { p_school_id: number; p_student_id: string }
        Returns: {
          client_updated_at: string
          done_updated_at: string
          entry_id: string
          homework_id: string
          is_done: boolean
          last_modified_by: string
          lesson_date: string
          school_id: number
          student_id: string
          updated_at: string
        }[]
      }
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
      get_student_lesson_mappings_v2: {
        Args: { p_school_id: number; p_student_id: string }
        Returns: {
          canonical_key: string
          default_color_hue: number
          default_icon: string
          default_name: string
          display_color_hue: number
          display_icon: string
          display_name: string
          is_overridden: boolean
          mapping_id: string
          override_color_hue: number
          override_display_name: string
          override_icon: string
          override_id: string
          school_id: number
          student_id: string
          updated_at: string
        }[]
      }
      reset_user_lesson_override_v2: {
        Args: {
          p_canonical_key: string
          p_client_updated_at?: string
          p_last_modified_by?: string
          p_school_id: number
          p_student_id: string
        }
        Returns: undefined
      }
      upsert_student_homework_status:
        | {
            Args: {
              p_client_updated_at?: string
              p_entry_id: string
              p_is_done: boolean
              p_last_modified_by?: string
              p_school_id: number
              p_student_id: string
            }
            Returns: {
              client_updated_at: string
              done_updated_at: string
              entry_id: string
              homework_id: string
              is_done: boolean
              last_modified_by: string
              lesson_date: string
              school_id: number
              student_id: string
              updated_at: string
            }[]
          }
        | {
            Args: {
              p_client_updated_at?: string
              p_display_date?: string
              p_entry_id: string
              p_hold?: string
              p_is_done: boolean
              p_items_json?: Json
              p_last_modified_by?: string
              p_lesson_date?: string
              p_note?: string
              p_room?: string
              p_school_id: number
              p_student_id: string
              p_teacher?: string
              p_title?: string
            }
            Returns: {
              client_updated_at: string
              done_updated_at: string
              entry_id: string
              homework_id: string
              is_done: boolean
              last_modified_by: string
              lesson_date: string
              school_id: number
              student_id: string
              updated_at: string
            }[]
          }
      upsert_user_lesson_override_v2: {
        Args: {
          p_canonical_key: string
          p_client_updated_at?: string
          p_color_hue?: number
          p_default_color_hue?: number
          p_default_name: string
          p_display_name?: string
          p_icon?: string
          p_last_modified_by?: string
          p_school_id: number
          p_student_id: string
        }
        Returns: {
          canonical_key: string
          default_color_hue: number
          default_icon: string
          default_name: string
          display_color_hue: number
          display_icon: string
          display_name: string
          is_overridden: boolean
          mapping_id: string
          override_color_hue: number
          override_display_name: string
          override_icon: string
          override_id: string
          school_id: number
          student_id: string
          updated_at: string
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
