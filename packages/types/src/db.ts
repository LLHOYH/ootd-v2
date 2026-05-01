// AUTO-GENERATED — do not edit. Regenerate with: pnpm --filter @mei/types gen:db

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      chat_messages: {
        Row: {
          created_at: string
          kind: Database["public"]["Enums"]["chat_message_kind"]
          message_id: string
          ref_id: string | null
          sender_id: string
          text: string | null
          thread_id: string
        }
        Insert: {
          created_at?: string
          kind: Database["public"]["Enums"]["chat_message_kind"]
          message_id?: string
          ref_id?: string | null
          sender_id: string
          text?: string | null
          thread_id: string
        }
        Update: {
          created_at?: string
          kind?: Database["public"]["Enums"]["chat_message_kind"]
          message_id?: string
          ref_id?: string | null
          sender_id?: string
          text?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["thread_id"]
          },
        ]
      }
      chat_thread_participants: {
        Row: {
          last_read_at: string | null
          thread_id: string
          unread_count: number
          user_id: string
        }
        Insert: {
          last_read_at?: string | null
          thread_id: string
          unread_count?: number
          user_id: string
        }
        Update: {
          last_read_at?: string | null
          thread_id?: string
          unread_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["thread_id"]
          },
          {
            foreignKeyName: "chat_thread_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          hangout_id: string | null
          last_message_at: string | null
          name: string | null
          thread_id: string
          type: Database["public"]["Enums"]["chat_thread_type"]
        }
        Insert: {
          created_at?: string
          hangout_id?: string | null
          last_message_at?: string | null
          name?: string | null
          thread_id?: string
          type: Database["public"]["Enums"]["chat_thread_type"]
        }
        Update: {
          created_at?: string
          hangout_id?: string | null
          last_message_at?: string | null
          name?: string | null
          thread_id?: string
          type?: Database["public"]["Enums"]["chat_thread_type"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_hangout_id_fkey"
            columns: ["hangout_id"]
            isOneToOne: false
            referencedRelation: "hangouts"
            referencedColumns: ["hangout_id"]
          },
        ]
      }
      closet_items: {
        Row: {
          category: Database["public"]["Enums"]["clothing_category"]
          colors: string[]
          created_at: string
          description: string
          fabric_guess: string | null
          item_id: string
          name: string
          occasion_tags: Database["public"]["Enums"]["occasion"][]
          raw_storage_key: string | null
          status: Database["public"]["Enums"]["closet_item_status"]
          thumbnail_storage_key: string | null
          tuned_storage_key: string | null
          updated_at: string
          user_id: string
          weather_tags: Database["public"]["Enums"]["weather_tag"][]
        }
        Insert: {
          category: Database["public"]["Enums"]["clothing_category"]
          colors?: string[]
          created_at?: string
          description?: string
          fabric_guess?: string | null
          item_id?: string
          name: string
          occasion_tags?: Database["public"]["Enums"]["occasion"][]
          raw_storage_key?: string | null
          status?: Database["public"]["Enums"]["closet_item_status"]
          thumbnail_storage_key?: string | null
          tuned_storage_key?: string | null
          updated_at?: string
          user_id: string
          weather_tags?: Database["public"]["Enums"]["weather_tag"][]
        }
        Update: {
          category?: Database["public"]["Enums"]["clothing_category"]
          colors?: string[]
          created_at?: string
          description?: string
          fabric_guess?: string | null
          item_id?: string
          name?: string
          occasion_tags?: Database["public"]["Enums"]["occasion"][]
          raw_storage_key?: string | null
          status?: Database["public"]["Enums"]["closet_item_status"]
          thumbnail_storage_key?: string | null
          tuned_storage_key?: string | null
          updated_at?: string
          user_id?: string
          weather_tags?: Database["public"]["Enums"]["weather_tag"][]
        }
        Relationships: [
          {
            foreignKeyName: "closet_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      combination_items: {
        Row: {
          combo_id: string
          item_id: string
          position: number
        }
        Insert: {
          combo_id: string
          item_id: string
          position: number
        }
        Update: {
          combo_id?: string
          item_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "combination_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combinations"
            referencedColumns: ["combo_id"]
          },
          {
            foreignKeyName: "combination_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "closet_items"
            referencedColumns: ["item_id"]
          },
        ]
      }
      combinations: {
        Row: {
          combo_id: string
          created_at: string
          name: string
          occasion_tags: Database["public"]["Enums"]["occasion"][]
          source: Database["public"]["Enums"]["combination_source"]
          user_id: string
        }
        Insert: {
          combo_id?: string
          created_at?: string
          name: string
          occasion_tags?: Database["public"]["Enums"]["occasion"][]
          source: Database["public"]["Enums"]["combination_source"]
          user_id: string
        }
        Update: {
          combo_id?: string
          created_at?: string
          name?: string
          occasion_tags?: Database["public"]["Enums"]["occasion"][]
          source?: Database["public"]["Enums"]["combination_source"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combinations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          from_user_id: string
          status: Database["public"]["Enums"]["friend_request_status"]
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friend_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friendships_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hangout_members: {
        Row: {
          hangout_id: string
          invite_status: Database["public"]["Enums"]["hangout_invite_status"]
          joined_at: string
          role: Database["public"]["Enums"]["hangout_role"]
          shared_at: string | null
          shared_combo_id: string | null
          user_id: string
        }
        Insert: {
          hangout_id: string
          invite_status?: Database["public"]["Enums"]["hangout_invite_status"]
          joined_at?: string
          role?: Database["public"]["Enums"]["hangout_role"]
          shared_at?: string | null
          shared_combo_id?: string | null
          user_id: string
        }
        Update: {
          hangout_id?: string
          invite_status?: Database["public"]["Enums"]["hangout_invite_status"]
          joined_at?: string
          role?: Database["public"]["Enums"]["hangout_role"]
          shared_at?: string | null
          shared_combo_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hangout_members_hangout_id_fkey"
            columns: ["hangout_id"]
            isOneToOne: false
            referencedRelation: "hangouts"
            referencedColumns: ["hangout_id"]
          },
          {
            foreignKeyName: "hangout_members_shared_combo_id_fkey"
            columns: ["shared_combo_id"]
            isOneToOne: false
            referencedRelation: "combinations"
            referencedColumns: ["combo_id"]
          },
          {
            foreignKeyName: "hangout_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hangouts: {
        Row: {
          created_at: string
          expires_at: string
          hangout_id: string
          location_name: string | null
          name: string
          owner_id: string
          starts_at: string
          status: Database["public"]["Enums"]["hangout_status"]
        }
        Insert: {
          created_at?: string
          expires_at: string
          hangout_id?: string
          location_name?: string | null
          name: string
          owner_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["hangout_status"]
        }
        Update: {
          created_at?: string
          expires_at?: string
          hangout_id?: string
          location_name?: string | null
          name?: string
          owner_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["hangout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "hangouts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ootd_posts: {
        Row: {
          caption: string | null
          combo_id: string
          created_at: string
          fallback_outfit_card_storage_key: string | null
          location_name: string | null
          ootd_id: string
          selfie_id: string | null
          try_on_storage_key: string | null
          user_id: string
          visibility: Database["public"]["Enums"]["ootd_visibility"]
          visibility_targets: string[]
        }
        Insert: {
          caption?: string | null
          combo_id: string
          created_at?: string
          fallback_outfit_card_storage_key?: string | null
          location_name?: string | null
          ootd_id?: string
          selfie_id?: string | null
          try_on_storage_key?: string | null
          user_id: string
          visibility: Database["public"]["Enums"]["ootd_visibility"]
          visibility_targets?: string[]
        }
        Update: {
          caption?: string | null
          combo_id?: string
          created_at?: string
          fallback_outfit_card_storage_key?: string | null
          location_name?: string | null
          ootd_id?: string
          selfie_id?: string | null
          try_on_storage_key?: string | null
          user_id?: string
          visibility?: Database["public"]["Enums"]["ootd_visibility"]
          visibility_targets?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ootd_posts_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combinations"
            referencedColumns: ["combo_id"]
          },
          {
            foreignKeyName: "ootd_posts_selfie_id_fkey"
            columns: ["selfie_id"]
            isOneToOne: false
            referencedRelation: "selfies"
            referencedColumns: ["selfie_id"]
          },
          {
            foreignKeyName: "ootd_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ootd_reactions: {
        Row: {
          created_at: string
          ootd_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ootd_id: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ootd_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ootd_reactions_ootd_id_fkey"
            columns: ["ootd_id"]
            isOneToOne: false
            referencedRelation: "ootd_posts"
            referencedColumns: ["ootd_id"]
          },
          {
            foreignKeyName: "ootd_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["push_platform"]
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["push_platform"]
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["push_platform"]
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      selfies: {
        Row: {
          selfie_id: string
          storage_key: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          selfie_id?: string
          storage_key: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          selfie_id?: string
          storage_key?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "selfies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stella_conversations: {
        Row: {
          convo_id: string
          created_at: string
          last_message_at: string
          title: string
          user_id: string
        }
        Insert: {
          convo_id?: string
          created_at?: string
          last_message_at?: string
          title?: string
          user_id: string
        }
        Update: {
          convo_id?: string
          created_at?: string
          last_message_at?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stella_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stella_messages: {
        Row: {
          convo_id: string
          created_at: string
          message_id: string
          role: Database["public"]["Enums"]["stella_message_role"]
          text: string | null
          tool_name: string | null
          tool_result: string | null
          tool_use_id: string | null
        }
        Insert: {
          convo_id: string
          created_at?: string
          message_id?: string
          role: Database["public"]["Enums"]["stella_message_role"]
          text?: string | null
          tool_name?: string | null
          tool_result?: string | null
          tool_use_id?: string | null
        }
        Update: {
          convo_id?: string
          created_at?: string
          message_id?: string
          role?: Database["public"]["Enums"]["stella_message_role"]
          text?: string | null
          tool_name?: string | null
          tool_result?: string | null
          tool_use_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stella_messages_convo_id_fkey"
            columns: ["convo_id"]
            isOneToOne: false
            referencedRelation: "stella_conversations"
            referencedColumns: ["convo_id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          birth_year: number | null
          city: string | null
          climate_profile: Database["public"]["Enums"]["climate_profile"] | null
          contributes_to_community_looks: boolean
          country_code: string | null
          created_at: string
          discoverable: boolean
          display_name: string
          gender: string | null
          last_active_at: string
          style_preferences: string[]
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          birth_year?: number | null
          city?: string | null
          climate_profile?:
            | Database["public"]["Enums"]["climate_profile"]
            | null
          contributes_to_community_looks?: boolean
          country_code?: string | null
          created_at?: string
          discoverable?: boolean
          display_name: string
          gender?: string | null
          last_active_at?: string
          style_preferences?: string[]
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          birth_year?: number | null
          city?: string | null
          climate_profile?:
            | Database["public"]["Enums"]["climate_profile"]
            | null
          contributes_to_community_looks?: boolean
          country_code?: string | null
          created_at?: string
          discoverable?: boolean
          display_name?: string
          gender?: string | null
          last_active_at?: string
          style_preferences?: string[]
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      combo_shared_in_user_hangout: {
        Args: { p_combo_id: string; p_user_id: string }
        Returns: boolean
      }
      get_friends: {
        Args: { p_user_id: string }
        Returns: {
          friend_id: string
          friended_at: string
        }[]
      }
      is_friend: { Args: { a: string; b: string }; Returns: boolean }
      is_hangout_member: {
        Args: { p_hangout_id: string; p_user_id: string }
        Returns: boolean
      }
      is_thread_participant: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: boolean
      }
      ootd_visibility_rank: {
        Args: { v: Database["public"]["Enums"]["ootd_visibility"] }
        Returns: number
      }
      user_in_any_hangout: {
        Args: { p_hangout_ids: string[]; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      chat_message_kind:
        | "TEXT"
        | "CLOSET_ITEM"
        | "COMBINATION"
        | "OOTD"
        | "IMAGE"
      chat_thread_type: "DIRECT" | "GROUP" | "HANGOUT" | "STELLA"
      climate_profile: "TROPICAL" | "TEMPERATE" | "ARID" | "COLD"
      closet_item_status: "PROCESSING" | "READY" | "FAILED"
      clothing_category:
        | "DRESS"
        | "TOP"
        | "BOTTOM"
        | "OUTERWEAR"
        | "SHOE"
        | "BAG"
        | "ACCESSORY"
      combination_source: "STELLA" | "TODAY_PICK" | "CRAFTED" | "COORDINATED"
      friend_request_status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED"
      hangout_invite_status: "INVITED" | "JOINED" | "DECLINED"
      hangout_role: "OWNER" | "MEMBER"
      hangout_status: "ACTIVE" | "EXPIRED" | "CANCELLED"
      occasion:
        | "CASUAL"
        | "WORK"
        | "DATE"
        | "BRUNCH"
        | "EVENING"
        | "WEDDING"
        | "WORKOUT"
        | "BEACH"
      ootd_visibility: "PUBLIC" | "FRIENDS" | "GROUP" | "DIRECT"
      push_platform: "ios" | "android" | "web"
      stella_message_role: "USER" | "ASSISTANT"
      weather_tag: "HOT" | "WARM" | "MILD" | "COLD" | "RAIN"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
      chat_message_kind: [
        "TEXT",
        "CLOSET_ITEM",
        "COMBINATION",
        "OOTD",
        "IMAGE",
      ],
      chat_thread_type: ["DIRECT", "GROUP", "HANGOUT", "STELLA"],
      climate_profile: ["TROPICAL", "TEMPERATE", "ARID", "COLD"],
      closet_item_status: ["PROCESSING", "READY", "FAILED"],
      clothing_category: [
        "DRESS",
        "TOP",
        "BOTTOM",
        "OUTERWEAR",
        "SHOE",
        "BAG",
        "ACCESSORY",
      ],
      combination_source: ["STELLA", "TODAY_PICK", "CRAFTED", "COORDINATED"],
      friend_request_status: ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"],
      hangout_invite_status: ["INVITED", "JOINED", "DECLINED"],
      hangout_role: ["OWNER", "MEMBER"],
      hangout_status: ["ACTIVE", "EXPIRED", "CANCELLED"],
      occasion: [
        "CASUAL",
        "WORK",
        "DATE",
        "BRUNCH",
        "EVENING",
        "WEDDING",
        "WORKOUT",
        "BEACH",
      ],
      ootd_visibility: ["PUBLIC", "FRIENDS", "GROUP", "DIRECT"],
      push_platform: ["ios", "android", "web"],
      stella_message_role: ["USER", "ASSISTANT"],
      weather_tag: ["HOT", "WARM", "MILD", "COLD", "RAIN"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

