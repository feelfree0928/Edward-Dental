import { createClient } from "@supabase/supabase-js";

const REQUIRED_SUPABASE_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

let cachedSupabaseClient: ReturnType<typeof createClient> | null = null;

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

export interface SessionRow {
  id: string;
  patient_name: string | null;
  status: "active" | "completed" | "approved";
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
