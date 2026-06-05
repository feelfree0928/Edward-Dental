import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REQUIRED_SUPABASE_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export interface SessionRow {
  id: string;
  patient_name: string | null;
  status: "pending_consent" | "active" | "summarizing" | "completed" | "approved";
  started_at: string;
  ended_at: string | null;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: "patient" | "assistant";
  content: string;
  created_at: string;
}

export interface ConsentLogRow {
  id: string;
  session_id: string;
  consent_shown_at: string;
  q1_answer: string | null;
  q1_passed: boolean | null;
  q1_retries: number;
  q2_answer: string | null;
  q2_passed: boolean | null;
  q2_retries: number;
  q3_answer: string | null;
  q3_passed: boolean | null;
  q3_retries: number;
  intake_started_at: string | null;
  created_at: string;
}

export interface SummaryRow {
  id: string;
  session_id: string;
  chief_complaint: string | null;
  medical_history: string | null;
  dental_history: string | null;
  medications: string | null;
  allergies: string | null;
  notes: string | null;
}

export type Database = {
  public: {
    Tables: {
      sessions: {
        Row: SessionRow;
        Insert: {
          id?: string;
          patient_name?: string | null;
          status?: SessionRow["status"];
          started_at?: string;
          ended_at?: string | null;
        };
        Update: {
          patient_name?: string | null;
          status?: SessionRow["status"];
          started_at?: string;
          ended_at?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: {
          id?: string;
          session_id: string;
          role: MessageRow["role"];
          content: string;
          created_at?: string;
        };
        Update: Partial<Omit<MessageRow, "id">>;
        Relationships: [];
      };
      clinical_summaries: {
        Row: SummaryRow;
        Insert: {
          id?: string;
          session_id: string;
          chief_complaint?: string | null;
          medical_history?: string | null;
          dental_history?: string | null;
          medications?: string | null;
          allergies?: string | null;
          notes?: string | null;
        };
        Update: Partial<Omit<SummaryRow, "id">>;
        Relationships: [];
      };
      consent_logs: {
        Row: ConsentLogRow;
        Insert: {
          id?: string;
          session_id: string;
          consent_shown_at: string;
          q1_answer?: string | null;
          q1_passed?: boolean | null;
          q1_retries?: number;
          q2_answer?: string | null;
          q2_passed?: boolean | null;
          q2_retries?: number;
          q3_answer?: string | null;
          q3_passed?: boolean | null;
          q3_retries?: number;
          intake_started_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<ConsentLogRow, "id">>;
        Relationships: [];
      };
    };
    Views: {
      sessions_list: {
        Row: SessionRow & { message_count: number };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
};

// Use the default untyped client so PostgREST operations are not inferred as `never`.
// Row-level types are still enforced via `.returns<T>()` / `.single<T>()` at call sites.
let cachedSupabaseClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  const missing = REQUIRED_SUPABASE_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return {
      client: null,
      error: `Missing required environment variable(s): ${missing.join(
        ", "
      )}. Add them to .env.local and restart the server.`,
    };
  }

  if (!cachedSupabaseClient) {
    cachedSupabaseClient = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );
  }

  return { client: cachedSupabaseClient, error: null };
}
