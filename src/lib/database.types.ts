// Hand-maintained until a Supabase project exists. Once provisioned, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
// Grows one table per milestone. M1: profiles.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string | null;
          avatar_url: string | null;
          phone: string | null;
          email: string | null;
          theme: string;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          email?: string | null;
          theme?: string;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          email?: string | null;
          theme?: string;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          type: string;
          currency: string;
          created_by: string;
          created_at: string;
          image_path: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          type?: string;
          currency?: string;
          created_by: string;
          created_at?: string;
          image_path?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          type?: string;
          currency?: string;
          created_by?: string;
          created_at?: string;
          image_path?: string | null;
        };
        Relationships: [];
      };
      group_members: {
        Row: {
          group_id: string;
          user_id: string;
          default_split_percent: number;
          joined_at: string;
        };
        Insert: {
          group_id: string;
          user_id: string;
          default_split_percent?: number;
          joined_at?: string;
        };
        Update: {
          group_id?: string;
          user_id?: string;
          default_split_percent?: number;
          joined_at?: string;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          id: string;
          group_id: string;
          token: string;
          created_by: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          token?: string;
          created_by: string;
          expires_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          token?: string;
          created_by?: string;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          group_id: string;
          paid_by: string;
          amount: number;
          description: string;
          date: string;
          created_at: string;
          updated_at: string | null;
          settled_at: string | null;
        };
        Insert: {
          id?: string;
          group_id: string;
          paid_by: string;
          amount: number;
          description?: string;
          date?: string;
          created_at?: string;
          updated_at?: string | null;
          settled_at?: string | null;
        };
        Update: {
          id?: string;
          group_id?: string;
          paid_by?: string;
          amount?: number;
          description?: string;
          date?: string;
          created_at?: string;
          updated_at?: string | null;
          settled_at?: string | null;
        };
        Relationships: [];
      };
      expense_shares: {
        Row: {
          expense_id: string;
          user_id: string;
          percent: number;
          amount_owed: number;
        };
        Insert: {
          expense_id: string;
          user_id: string;
          percent: number;
          amount_owed: number;
        };
        Update: {
          expense_id?: string;
          user_id?: string;
          percent?: number;
          amount_owed?: number;
        };
        Relationships: [];
      };
      device_tokens: {
        Row: {
          token: string;
          user_id: string;
          platform: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          token: string;
          user_id: string;
          platform?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          token?: string;
          user_id?: string;
          platform?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settlements: {
        Row: {
          id: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount: number;
          settled_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount: number;
          settled_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          from_user?: string;
          to_user?: string;
          amount?: number;
          settled_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      group_balances: {
        Row: {
          group_id: string;
          user_id: string;
          net_cents: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_group_member: {
        Args: { gid: string };
        Returns: boolean;
      };
      shares_group_with: {
        Args: { other: string };
        Returns: boolean;
      };
      join_group: {
        Args: { invite_token: string };
        Returns: string;
      };
      add_expense: {
        Args: {
          p_group_id: string;
          p_paid_by: string;
          p_amount: number;
          p_description: string;
          p_date: string;
          p_shares: Json;
        };
        Returns: string;
      };
      leave_group: {
        Args: { p_group_id: string };
        Returns: undefined;
      };
      delete_my_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      update_expense: {
        Args: {
          p_expense_id: string;
          p_paid_by: string;
          p_amount: number;
          p_description: string;
          p_date: string;
          p_shares: Json;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
