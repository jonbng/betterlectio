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
      admin_audit_log: {
        Row: {
          action: string
          actor: string
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      feedback_attachments: {
        Row: {
          byte_size: number | null
          created_at: string
          feedback_id: string
          height: number | null
          id: string
          kind: string
          mime_type: string | null
          storage_path: string
          width: number | null
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          feedback_id: string
          height?: number | null
          id?: string
          kind: string
          mime_type?: string | null
          storage_path: string
          width?: number | null
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          feedback_id?: string
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_attachments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_comments: {
        Row: {
          author_admin: string | null
          author_kind: string
          author_student_id: string | null
          body: string
          created_at: string
          feedback_id: string
          id: string
          is_internal: boolean
        }
        Insert: {
          author_admin?: string | null
          author_kind: string
          author_student_id?: string | null
          body: string
          created_at?: string
          feedback_id: string
          id?: string
          is_internal?: boolean
        }
        Update: {
          author_admin?: string | null
          author_kind?: string
          author_student_id?: string | null
          body?: string
          created_at?: string
          feedback_id?: string
          id?: string
          is_internal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "feedback_comments_author_student_id_fkey"
            columns: ["author_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_comments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_items: {
        Row: {
          admin_notes: string | null
          app_version: string | null
          app_version_code: number | null
          browser_info: string | null
          build_type: string | null
          category: string
          created_at: string
          device_manufacturer: string | null
          device_model: string | null
          duplicate_of: string | null
          id: string
          import_external_id: string | null
          import_source: string | null
          import_url: string | null
          include_logs: boolean
          is_public: boolean
          last_status_changed_at: string | null
          last_status_changed_by: string | null
          lectio_version: string | null
          locale: string | null
          logs: string | null
          made_public_at: string | null
          message: string
          os_version: string | null
          platform: string
          posthog_distinct_id: string | null
          posthog_session_id: string | null
          priority: number | null
          public_description: string | null
          public_title: string | null
          roadmap_eta: string | null
          roadmap_sort: number | null
          roadmap_vote_count: number
          school_id: number
          status: string
          student_id: string
          supabase_uid: string
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          app_version?: string | null
          app_version_code?: number | null
          browser_info?: string | null
          build_type?: string | null
          category: string
          created_at?: string
          device_manufacturer?: string | null
          device_model?: string | null
          duplicate_of?: string | null
          id?: string
          import_external_id?: string | null
          import_source?: string | null
          import_url?: string | null
          include_logs?: boolean
          is_public?: boolean
          last_status_changed_at?: string | null
          last_status_changed_by?: string | null
          lectio_version?: string | null
          locale?: string | null
          logs?: string | null
          made_public_at?: string | null
          message: string
          os_version?: string | null
          platform: string
          posthog_distinct_id?: string | null
          posthog_session_id?: string | null
          priority?: number | null
          public_description?: string | null
          public_title?: string | null
          roadmap_eta?: string | null
          roadmap_sort?: number | null
          roadmap_vote_count?: number
          school_id: number
          status?: string
          student_id: string
          supabase_uid: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          app_version?: string | null
          app_version_code?: number | null
          browser_info?: string | null
          build_type?: string | null
          category?: string
          created_at?: string
          device_manufacturer?: string | null
          device_model?: string | null
          duplicate_of?: string | null
          id?: string
          import_external_id?: string | null
          import_source?: string | null
          import_url?: string | null
          include_logs?: boolean
          is_public?: boolean
          last_status_changed_at?: string | null
          last_status_changed_by?: string | null
          lectio_version?: string | null
          locale?: string | null
          logs?: string | null
          made_public_at?: string | null
          message?: string
          os_version?: string | null
          platform?: string
          posthog_distinct_id?: string | null
          posthog_session_id?: string | null
          priority?: number | null
          public_description?: string | null
          public_title?: string | null
          roadmap_eta?: string | null
          roadmap_sort?: number | null
          roadmap_vote_count?: number
          school_id?: number
          status?: string
          student_id?: string
          supabase_uid?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_items_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_status_events: {
        Row: {
          actor: string
          created_at: string
          feedback_id: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          actor: string
          created_at?: string
          feedback_id: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          actor?: string
          created_at?: string
          feedback_id?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_status_events_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
        ]
      }
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
      profile_picture_submissions: {
        Row: {
          approved_url: string | null
          byte_size: number
          created_at: string
          id: string
          mime_type: string
          platform: string
          rejection_reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: number
          source_deleted_at: string | null
          status: string
          storage_path: string
          student_id: string
          submitted_at: string | null
          supabase_uid: string
          updated_at: string
        }
        Insert: {
          approved_url?: string | null
          byte_size: number
          created_at?: string
          id?: string
          mime_type: string
          platform: string
          rejection_reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: number
          source_deleted_at?: string | null
          status?: string
          storage_path: string
          student_id: string
          submitted_at?: string | null
          supabase_uid: string
          updated_at?: string
        }
        Update: {
          approved_url?: string | null
          byte_size?: number
          created_at?: string
          id?: string
          mime_type?: string
          platform?: string
          rejection_reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: number
          source_deleted_at?: string | null
          status?: string
          storage_path?: string
          student_id?: string
          submitted_at?: string | null
          supabase_uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_picture_submissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_picture_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_clicks: {
        Row: {
          city: string | null
          converted_at: string | null
          converted_student_id: string | null
          cookie_id: string
          country: string | null
          created_at: string
          expired_at: string | null
          id: string
          ip_hash: string | null
          landing_url: string | null
          referer: string | null
          referrer_student_id: string
          rejection_reason: string | null
          user_agent: string | null
        }
        Insert: {
          city?: string | null
          converted_at?: string | null
          converted_student_id?: string | null
          cookie_id: string
          country?: string | null
          created_at?: string
          expired_at?: string | null
          id?: string
          ip_hash?: string | null
          landing_url?: string | null
          referer?: string | null
          referrer_student_id: string
          rejection_reason?: string | null
          user_agent?: string | null
        }
        Update: {
          city?: string | null
          converted_at?: string | null
          converted_student_id?: string | null
          cookie_id?: string
          country?: string | null
          created_at?: string
          expired_at?: string | null
          id?: string
          ip_hash?: string | null
          landing_url?: string | null
          referer?: string | null
          referrer_student_id?: string
          rejection_reason?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_converted_student_id_fkey"
            columns: ["converted_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_clicks_referrer_student_id_fkey"
            columns: ["referrer_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_votes: {
        Row: {
          created_at: string
          feedback_id: string
          id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          feedback_id: string
          id?: string
          voter_id: string
        }
        Update: {
          created_at?: string
          feedback_id?: string
          id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_votes_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
        ]
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
          lat: number | null
          lon: number | null
          name: string
          student_count: number | null
          student_count_updated_at: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: number
          lat?: number | null
          lon?: number | null
          name: string
          student_count?: number | null
          student_count_updated_at?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: number
          lat?: number | null
          lon?: number | null
          name?: string
          student_count?: number | null
          student_count_updated_at?: string | null
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
          android_installed_at: string | null
          app_eligible: boolean
          app_installed_at: string | null
          app_qr_scanned_at: string | null
          birthdate: string | null
          class_name: string | null
          created_at: string
          custom_pfp_approved_at: string | null
          custom_pfp_url: string | null
          description: string | null
          dismissed_app_prompt_at: string | null
          extension_installed_at: string | null
          extension_reinstalled_at: string | null
          extension_uninstall_feedback: string | null
          extension_uninstall_reason: string | null
          extension_uninstalled_at: string | null
          id: string
          instagram: string | null
          iphone_installed_at: string | null
          last_seen_at: string | null
          lectio_first_name: string | null
          lectio_last_name: string | null
          lectio_pfp_url: string | null
          marked_android_at: string | null
          name: string | null
          pfp_hash: string | null
          referral_click_id: string | null
          referral_reward_unlocked_at: string | null
          referred_at: string | null
          referred_by: string | null
          school_id: number
          show_birthday: boolean
          supabase_id: string
        }
        Insert: {
          android_installed_at?: string | null
          app_eligible?: boolean
          app_installed_at?: string | null
          app_qr_scanned_at?: string | null
          birthdate?: string | null
          class_name?: string | null
          created_at?: string
          custom_pfp_approved_at?: string | null
          custom_pfp_url?: string | null
          description?: string | null
          dismissed_app_prompt_at?: string | null
          extension_installed_at?: string | null
          extension_reinstalled_at?: string | null
          extension_uninstall_feedback?: string | null
          extension_uninstall_reason?: string | null
          extension_uninstalled_at?: string | null
          id: string
          instagram?: string | null
          iphone_installed_at?: string | null
          last_seen_at?: string | null
          lectio_first_name?: string | null
          lectio_last_name?: string | null
          lectio_pfp_url?: string | null
          marked_android_at?: string | null
          name?: string | null
          pfp_hash?: string | null
          referral_click_id?: string | null
          referral_reward_unlocked_at?: string | null
          referred_at?: string | null
          referred_by?: string | null
          school_id: number
          show_birthday?: boolean
          supabase_id: string
        }
        Update: {
          android_installed_at?: string | null
          app_eligible?: boolean
          app_installed_at?: string | null
          app_qr_scanned_at?: string | null
          birthdate?: string | null
          class_name?: string | null
          created_at?: string
          custom_pfp_approved_at?: string | null
          custom_pfp_url?: string | null
          description?: string | null
          dismissed_app_prompt_at?: string | null
          extension_installed_at?: string | null
          extension_reinstalled_at?: string | null
          extension_uninstall_feedback?: string | null
          extension_uninstall_reason?: string | null
          extension_uninstalled_at?: string | null
          id?: string
          instagram?: string | null
          iphone_installed_at?: string | null
          last_seen_at?: string | null
          lectio_first_name?: string | null
          lectio_last_name?: string | null
          lectio_pfp_url?: string | null
          marked_android_at?: string | null
          name?: string | null
          pfp_hash?: string | null
          referral_click_id?: string | null
          referral_reward_unlocked_at?: string | null
          referred_at?: string | null
          referred_by?: string | null
          school_id?: number
          show_birthday?: boolean
          supabase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_referral_click_id_fkey"
            columns: ["referral_click_id"]
            isOneToOne: false
            referencedRelation: "referral_clicks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
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
      user_school_themes: {
        Row: {
          created_at: string
          school_id: string
          supabase_id: string
          theme_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          school_id: string
          supabase_id: string
          theme_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          school_id?: string
          supabase_id?: string
          theme_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          schema_version: number
          settings: Json
          supabase_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          schema_version?: number
          settings?: Json
          supabase_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          schema_version?: number
          settings?: Json
          supabase_id?: string
          updated_at?: string
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
      confirm_auth_attempt: {
        Args: { p_completion_kind?: string; p_request_id: string }
        Returns: boolean
      }
      get_student_profile: {
        Args: { p_student_id: string }
        Returns: {
          app_installed_at: string | null
          birthdate: string | null
          class_name: string | null
          custom_pfp_url: string | null
          description: string | null
          extension_installed_at: string | null
          extension_uninstalled_at: string | null
          id: string
          instagram: string | null
          last_seen_at: string | null
          lectio_pfp_url: string | null
          name: string | null
          show_birthday: boolean
        }[]
      }
      get_student_profiles: {
        Args: { p_student_ids: string[] }
        Returns: {
          app_installed_at: string | null
          birthdate: string | null
          class_name: string | null
          custom_pfp_url: string | null
          description: string | null
          extension_installed_at: string | null
          extension_uninstalled_at: string | null
          id: string
          instagram: string | null
          last_seen_at: string | null
          lectio_pfp_url: string | null
          name: string | null
          show_birthday: boolean
        }[]
      }
      get_my_profile_picture_state: {
        Args: { p_student_id: string }
        Returns: Json
      }
      get_my_school_id: { Args: never; Returns: number }
      get_referral_stats: {
        Args: { p_student_id: string }
        Returns: {
          conversions: number
          recent_referrals: Json
          total_clicks: number
          unique_clickers: number
        }[]
      }
      review_profile_picture_submission: {
        Args: {
          p_decision: string
          p_public_url?: string
          p_rejection_reason?: string
          p_review_note?: string
          p_submission_id: string
        }
        Returns: Json
      }
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
      list_user_school_themes: {
        Args: never
        Returns: {
          school_id: string
          theme_id: string
          updated_at: string
        }[]
      }
      register_feedback_attachment: {
        Args: {
          p_byte_size?: number
          p_feedback_id: string
          p_height?: number
          p_kind: string
          p_mime_type?: string
          p_storage_path: string
          p_width?: number
        }
        Returns: string
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
      submit_feedback: {
        Args: {
          p_category: string
          p_context?: Json
          p_message: string
          p_platform: string
          p_school_id: number
          p_student_id: string
        }
        Returns: string
      }
      touch_student_last_seen: {
        Args: { p_school_id: number; p_student_id: string }
        Returns: boolean
      }
      update_school_student_count: {
        Args: { p_count: number; p_school_id: number }
        Returns: boolean
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
      upsert_user_school_theme: {
        Args: {
          p_client_updated_at: string
          p_school_id: string
          p_theme_id: string
        }
        Returns: {
          school_id: string
          theme_id: string
          updated_at: string
        }[]
      }
      upsert_user_settings: {
        Args: {
          p_client_updated_at: string
          p_schema_version?: number
          p_settings: Json
        }
        Returns: {
          schema_version: number
          settings: Json
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
