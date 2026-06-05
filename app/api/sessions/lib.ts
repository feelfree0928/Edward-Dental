import type { Anthropic } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  getSupabaseClient,
  type ConsentLogRow,
  type SessionRow,
  type MessageRow,
  type SummaryRow,
} from "@/lib/supabase";
import { CONSENT_SCREEN_TEXT, VERIFICATION_QUESTIONS } from "@/lib/consent-verification";
import { CLAUDE_MODEL, extractSummaryTool, getAnthropicClient, isAnthropicAccessDenied } from "@/lib/anthropic";
import { extractFallbackSummary, isIntakeFallbackEnabled } from "@/lib/intake-fallback";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export function resolveSupabaseClient() {
  const { client, error } = getSupabaseClient();
  if (!client) {
    throw new ApiError(error ?? "Supabase client is unavailable", 500);
  }
  return client;
}

export function isMissingRelationError(error: unknown, relationName: string) {
  if (!error || typeof error !== "object") return false;
  const maybeCode = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const maybeMessage =
    "message" in error ? String((error as { message?: unknown }).message ?? "").toLowerCase() : "";
  return maybeCode === "42P01" && maybeMessage.includes(relationName.toLowerCase());
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function toErrorResponse(error: unknown, fallback = "Unexpected server error") {
  const status = error instanceof ApiError ? error.status : 500;
  return NextResponse.json({ error: toErrorMessage(error, fallback) }, { status });
}

export function isSessionReviewReady(status: SessionRow["status"]): boolean {
  return status === "completed" || status === "approved";
}

export function rowToSessionResponse(row: SessionRow, messageCount = 0) {
  return {
    id: row.id,
    patientName: row.patient_name,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    messageCount,
    summaryReady: isSessionReviewReady(row.status),
  };
}

export function messageRowToApi(row: MessageRow) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: row.created_at,
  };
}

export function summaryRowToApi(row: SummaryRow | null) {
  if (!row) return null;
  return {
    chiefComplaint: row.chief_complaint,
    medicalHistory: row.medical_history,
    dentalHistory: row.dental_history,
    medications: row.medications,
    allergies: row.allergies,
    notes: row.notes,
  };
}

export function consentLogToApi(row: ConsentLogRow | null) {
  if (!row) return null;

  const consentAccepted =
    row.q1_passed === true &&
    row.q2_passed === true &&
    row.q3_passed === true &&
    row.intake_started_at != null;

  return {
    consentShownAt: row.consent_shown_at,
    intakeStartedAt: row.intake_started_at,
    consentAccepted,
    consentLanguage: CONSENT_SCREEN_TEXT,
    questions: [
      {
        index: 1 as const,
        question: VERIFICATION_QUESTIONS[0],
        answer: row.q1_answer,
        passed: row.q1_passed,
        retries: row.q1_retries,
      },
      {
        index: 2 as const,
        question: VERIFICATION_QUESTIONS[1],
        answer: row.q2_answer,
        passed: row.q2_passed,
        retries: row.q2_retries,
      },
      {
        index: 3 as const,
        question: VERIFICATION_QUESTIONS[2],
        answer: row.q3_answer,
        passed: row.q3_passed,
        retries: row.q3_retries,
      },
    ],
  };
}

export async function fetchSessionDetail(sessionId: string) {
  const supabase = resolveSupabaseClient();

  const [sessionRes, messagesRes, summaryRes, consentRes] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", sessionId).single<SessionRow>(),
    supabase
      .from("messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .returns<MessageRow[]>(),
    supabase
      .from("clinical_summaries")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle<SummaryRow>(),
    supabase
      .from("consent_logs")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle<ConsentLogRow>(),
  ]);

  return {
    session: sessionRes.data,
    messages: messagesRes.data ?? [],
    summary: summaryRes.data,
    consent: consentRes.data,
  };
}

async function upsertClinicalSummary(
  supabase: ReturnType<typeof resolveSupabaseClient>,
  sessionId: string,
  fields: {
    chief_complaint: string | null;
    medical_history: string | null;
    dental_history: string | null;
    medications: string | null;
    allergies: string | null;
    notes: string | null;
  }
) {
  await supabase.from("clinical_summaries").upsert({
    session_id: sessionId,
    ...fields,
  });
}

async function markSessionCompleted(
  supabase: ReturnType<typeof resolveSupabaseClient>,
  sessionId: string
) {
  await supabase.from("sessions").update({ status: "completed" }).eq("id", sessionId);
}

export async function endSessionWithSummary(sessionId: string): Promise<void> {
  const supabase = resolveSupabaseClient();
  const endedAt = new Date().toISOString();

  await supabase
    .from("sessions")
    .update({ status: "summarizing", ended_at: endedAt })
    .eq("id", sessionId);

  try {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const messages = msgRows ?? [];

    if (messages.length === 0) {
      await upsertClinicalSummary(supabase, sessionId, {
        chief_complaint: null,
        medical_history: null,
        dental_history: null,
        medications: null,
        allergies: null,
        notes: null,
      });
      return;
    }

    const saveFallbackSummary = () =>
      upsertClinicalSummary(supabase, sessionId, extractFallbackSummary(messages));

    if (isIntakeFallbackEnabled()) {
      await saveFallbackSummary();
      return;
    }

    const transcript = messages
      .map((m) => `${m.role === "patient" ? "Patient" : "Dental Assistant"}: ${m.content}`)
      .join("\n\n");

    const summaryPrompt = `You are preparing a detailed dental intake handoff note for clinical staff.

Use the extract_clinical_summary tool and populate every field with the most specific information available from the transcript.

Requirements:
- Preserve the patient's own wording for core symptoms when useful.
- Include timeline, symptom characteristics, and severity details when available.
- Capture medical and dental context relevant to treatment safety and planning.
- If a field is not mentioned, return null for that field.
- In "notes", provide a structured hybrid summary with these headings:
  1) Symptom Details
  2) Urgency/Red Flags
  3) Patient Concerns and Anxiety
  4) Missing Information
  5) Front Desk Preparation Notes
- Do not diagnose and do not invent information.

Conversation transcript:
${transcript}`;

    const anthropic = getAnthropicClient();
    if (!anthropic) {
      await saveFallbackSummary();
      return;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const summaryResponse = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1600,
          tools: [extractSummaryTool],
          tool_choice: { type: "any" },
          messages: [{ role: "user", content: summaryPrompt }],
        });

        const toolUse = summaryResponse.content.find(
          (b) => b.type === "tool_use" && b.name === "extract_clinical_summary"
        ) as Extract<Anthropic.ContentBlock, { type: "tool_use" }> | undefined;

        if (toolUse) {
          const input = toolUse.input as Record<string, string | null>;
          await upsertClinicalSummary(supabase, sessionId, {
            chief_complaint: input.chiefComplaint ?? null,
            medical_history: input.medicalHistory ?? null,
            dental_history: input.dentalHistory ?? null,
            medications: input.medications ?? null,
            allergies: input.allergies ?? null,
            notes: input.notes ?? null,
          });
          return;
        }
      } catch (err) {
        if (isAnthropicAccessDenied(err)) {
          console.warn("Anthropic API returned 403; saved fallback clinical summary.");
          await saveFallbackSummary();
          return;
        }
        console.error(`Summary generation attempt ${attempt + 1} failed:`, err);
      }
    }

    await saveFallbackSummary();
  } catch (err) {
    console.error("Summary generation failed; attempting fallback summary:", err);
    const { data: msgRows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    const messages = msgRows ?? [];
    if (messages.length > 0) {
      await upsertClinicalSummary(supabase, sessionId, extractFallbackSummary(messages));
    }
  } finally {
    await markSessionCompleted(supabase, sessionId);
  }
}
