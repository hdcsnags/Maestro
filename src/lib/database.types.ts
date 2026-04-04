export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          slug: string;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          slug?: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      provider_connections: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          display_name: string;
          is_connected: boolean;
          models: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          display_name: string;
          is_connected?: boolean;
          models?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          is_connected?: boolean;
          models?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      encrypted_secrets: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          encrypted_key: string;
          key_hint: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          encrypted_key: string;
          key_hint?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          encrypted_key?: string;
          key_hint?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          name: string;
          role: string;
          provider: string;
          model: string;
          color: string;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          name: string;
          role: string;
          provider: string;
          model: string;
          color?: string;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          role?: string;
          provider?: string;
          model?: string;
          color?: string;
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          title: string;
          execution_mode: string;
          status: string;
          repo_connection_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          title?: string;
          execution_mode?: string;
          status?: string;
          repo_connection_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          execution_mode?: string;
          status?: string;
          repo_connection_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rounds: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          round_number: number;
          prompt: string;
          target_agents: Json;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          round_number?: number;
          prompt: string;
          target_agents?: Json;
          status?: string;
          created_at?: string;
        };
        Update: {
          status?: string;
          target_agents?: Json;
        };
        Relationships: [];
      };
      responses: {
        Row: {
          id: string;
          round_id: string;
          user_id: string;
          agent_id: string | null;
          agent_name: string;
          agent_role: string;
          agent_color: string;
          provider: string;
          model: string;
          content: string;
          title: string;
          signals: Json;
          is_flagged: boolean;
          is_lead: boolean;
          tokens_used: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          user_id: string;
          agent_id?: string | null;
          agent_name: string;
          agent_role: string;
          agent_color?: string;
          provider: string;
          model: string;
          content: string;
          title?: string;
          signals?: Json;
          is_flagged?: boolean;
          is_lead?: boolean;
          tokens_used?: number;
          created_at?: string;
        };
        Update: {
          is_flagged?: boolean;
          is_lead?: boolean;
          title?: string;
          signals?: Json;
        };
        Relationships: [];
      };
      syntheses: {
        Row: {
          id: string;
          round_id: string;
          user_id: string;
          content: string;
          lead_agent_id: string | null;
          source_response_ids: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          user_id: string;
          content: string;
          lead_agent_id?: string | null;
          source_response_ids?: Json;
          created_at?: string;
        };
        Update: {
          content?: string;
          lead_agent_id?: string | null;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          event_type: string;
          actor: string;
          provider: string;
          model: string;
          repo_scope: string;
          execution_mode: string;
          requires_approval: boolean;
          succeeded: boolean;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          event_type: string;
          actor?: string;
          provider?: string;
          model?: string;
          repo_scope?: string;
          execution_mode?: string;
          requires_approval?: boolean;
          succeeded?: boolean;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
