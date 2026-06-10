import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLAUDE_MODEL,
  formatAnthropicError,
  getAnthropicClient,
} from "@/lib/anthropic";
import {
  ANONYMOUS_NAME_SENTINEL,
  CONSENT_AGREEMENT_RETRY,
  CONSENT_CLARIFICATION_MESSAGE,
  CONSENT_DECLINE_MESSAGE,
  CONSENT_INTRO_TEXT,
  CONSENT_OPT_IN_QUESTION,
  CONSENT_REVIEW_TEXT,
  INTAKE_WELCOME_MESSAGE,
  buildConsentAgreementPrompt,
  parseConsentOutcome,
  type ConsentOutcome,
} from "@/lib/consent-verification";
import { ApiError } from "@/app/api/sessions/lib";
import type { MessageRow, SessionRow } from "@/lib/supabase";

type MessageLike = Pick<MessageRow, "role" | "content"> & { created_at?: string };

export function isAnonymousName(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  return (
    !normalized ||
    normalized === ANONYMOUS_NAME_SENTINEL ||
    normalized === "anon" ||
    normalized === "skip" ||
    normalized === "continue anonymously"
  );
}

export function parsePatientName(raw: string): string | null {
  if (isAnonymousName(raw)) return null;
  return raw.trim();
}

export function countConsentRetries(messages: MessageLike[]): number {
  return messages.filter(
    (m) => m.role === "assistant" && m.content === CONSENT_AGREEMENT_RETRY
  ).length;
}

export function isAwaitingConsentAnswer(messages: MessageLike[]): boolean {
  return messages.some(
    (m) => m.role === "assistant" && m.content === CONSENT_OPT_IN_QUESTION
  );
}

export function getConsentShownAt(messages: MessageLike[]): string {
  const intro = messages.find(
    (m) => m.role === "assistant" && m.content === CONSENT_INTRO_TEXT
  );
  return intro?.created_at ?? new Date().toISOString();
}

export async function evaluateConsentAnswer(answer: string): Promise<ConsentOutcome> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new ApiError(
      "Missing ANTHROPIC_API_KEY. Add it to .env and restart the dev server.",
      500
    );
  }

  const prompt = buildConsentAgreementPrompt(answer);

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    return parseConsentOutcome(text);
  } catch (err) {
    console.error("Consent verify Claude API error:", err);
    const { status, message } = formatAnthropicError(err);
    throw new ApiError(message, status >= 400 && status < 600 ? status : 502);
  }
}

export async function insertAssistantMessages(
  supabase: SupabaseClient,
  sessionId: string,
  contents: string[]
): Promise<MessageRow[]> {
  const rows: MessageRow[] = [];
  for (const content of contents) {
    const { data, error } = await supabase
      .from("messages")
      .insert({ session_id: sessionId, role: "assistant", content })
      .select()
      .single<MessageRow>();

    if (error || !data) {
      throw new Error("Failed to save assistant message");
    }
    rows.push(data);
  }
  return rows;
}

export async function acceptConsent(
  supabase: SupabaseClient,
  sessionId: string,
  payload: { consentShownAt: string; answer: string; retries: number }
): Promise<MessageRow> {
  const intakeStartedAt = new Date().toISOString();

  const { error: logError } = await supabase.from("consent_logs").upsert({
    session_id: sessionId,
    consent_shown_at: payload.consentShownAt,
    q1_answer: payload.answer.trim(),
    q1_passed: true,
    q1_retries: payload.retries,
    intake_started_at: intakeStartedAt,
  });

  if (logError) {
    throw new Error(logError.message);
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({ status: "active" })
    .eq("id", sessionId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data: welcomeRow, error: welcomeErr } = await supabase
    .from("messages")
    .insert({
      session_id: sessionId,
      role: "assistant",
      content: INTAKE_WELCOME_MESSAGE,
    })
    .select()
    .single<MessageRow>();

  if (welcomeErr || !welcomeRow) {
    throw new Error("Failed to save intake welcome message");
  }

  return welcomeRow;
}

export async function declineConsent(
  supabase: SupabaseClient,
  sessionId: string,
  payload: { consentShownAt: string; answer: string; retries: number }
): Promise<MessageRow> {
  const { error: logError } = await supabase.from("consent_logs").upsert({
    session_id: sessionId,
    consent_shown_at: payload.consentShownAt,
    q1_answer: payload.answer.trim(),
    q1_passed: false,
    q1_retries: payload.retries,
    intake_started_at: null,
  });

  if (logError) {
    throw new Error(logError.message);
  }

  const endedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("sessions")
    .update({ status: "completed", ended_at: endedAt })
    .eq("id", sessionId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data: declineRow, error: declineErr } = await supabase
    .from("messages")
    .insert({
      session_id: sessionId,
      role: "assistant",
      content: CONSENT_DECLINE_MESSAGE,
    })
    .select()
    .single<MessageRow>();

  if (declineErr || !declineRow) {
    throw new Error("Failed to save consent decline message");
  }

  return declineRow;
}

export async function handleNameCapture(
  supabase: SupabaseClient,
  sessionId: string,
  patientName: string
): Promise<MessageRow[]> {
  const parsedName = parsePatientName(patientName);

  const { error: nameErr } = await supabase
    .from("sessions")
    .update({ patient_name: parsedName })
    .eq("id", sessionId);

  if (nameErr) {
    throw new Error(nameErr.message);
  }

  return insertAssistantMessages(supabase, sessionId, [
    CONSENT_INTRO_TEXT,
    CONSENT_REVIEW_TEXT,
    CONSENT_OPT_IN_QUESTION,
  ]);
}

export type ConsentTurnResult = {
  assistantRows: MessageRow[];
  sessionEnded: boolean;
  sessionActivated: boolean;
};

export async function handleConsentAnswer(
  supabase: SupabaseClient,
  sessionId: string,
  answer: string,
  messages: MessageLike[]
): Promise<ConsentTurnResult> {
  const consentShownAt = getConsentShownAt(messages);
  const retries = countConsentRetries(messages);
  const outcome = await evaluateConsentAnswer(answer);

  if (outcome === "no") {
    const declineRow = await declineConsent(supabase, sessionId, {
      consentShownAt,
      answer,
      retries,
    });
    return { assistantRows: [declineRow], sessionEnded: true, sessionActivated: false };
  }

  if (outcome === "question") {
    const rows = await insertAssistantMessages(supabase, sessionId, [
      CONSENT_CLARIFICATION_MESSAGE,
    ]);
    return { assistantRows: rows, sessionEnded: false, sessionActivated: false };
  }

  if (outcome === "unclear") {
    if (retries === 0) {
      const rows = await insertAssistantMessages(supabase, sessionId, [CONSENT_AGREEMENT_RETRY]);
      return { assistantRows: rows, sessionEnded: false, sessionActivated: false };
    }
    const declineRow = await declineConsent(supabase, sessionId, {
      consentShownAt,
      answer,
      retries,
    });
    return { assistantRows: [declineRow], sessionEnded: true, sessionActivated: false };
  }

  if (outcome !== "yes") {
    const declineRow = await declineConsent(supabase, sessionId, {
      consentShownAt,
      answer,
      retries,
    });
    return { assistantRows: [declineRow], sessionEnded: true, sessionActivated: false };
  }

  const welcomeRow = await acceptConsent(supabase, sessionId, {
    consentShownAt,
    answer,
    retries,
  });
  return { assistantRows: [welcomeRow], sessionEnded: false, sessionActivated: true };
}

export function isConsentDeclinedSession(session: Pick<SessionRow, "status">): boolean {
  return session.status === "completed";
}
