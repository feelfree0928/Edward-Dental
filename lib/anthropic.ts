import Anthropic from "@anthropic-ai/sdk";

/** Override in .env if your workspace does not have Sonnet 4.6 enabled. */
export const CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5-20250929";

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

export function getAnthropicHttpStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    return Number((error as { status?: number }).status) || 500;
  }
  return 500;
}

export function isAnthropicAccessDenied(error: unknown): boolean {
  return getAnthropicHttpStatus(error) === 403;
}

export function formatAnthropicError(error: unknown): { message: string; status: number } {
  const status = getAnthropicHttpStatus(error);

  if (status === 401) {
    return {
      status: 502,
      message:
        "Invalid Anthropic API key. Create a new key at https://console.anthropic.com/settings/keys and set ANTHROPIC_API_KEY in .env.local, then restart the dev server.",
    };
  }

  if (status === 403) {
    return {
      status: 502,
      message:
        "Anthropic rejected this API key (403 Request not allowed). Use a key from https://console.anthropic.com (not a Replit-only secret), enable billing/model access for your workspace, and ensure your region allows the API. For local demos without Claude, set ANTHROPIC_DEV_FALLBACK=true in .env.",
    };
  }

  if (status === 404) {
    return {
      status: 502,
      message: `Model "${CLAUDE_MODEL}" was not found. Set ANTHROPIC_MODEL in .env to a model enabled in your Anthropic workspace.`,
    };
  }

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Anthropic API request failed";

  return { status: status >= 400 && status < 600 ? status : 502, message: raw };
}

export const INTAKE_MAX_WORDS = 12;
export const INTAKE_FAREWELL_MAX_WORDS = 25;

export function enforceMaxWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return trimmed;
  return words.slice(0, maxWords).join(" ");
}

export const INTAKE_SYSTEM_PROMPT = `You are the clinical intake assistant for Edward's Dental. Collect pre-visit facts only. Never diagnose or prescribe.

Response rules (strict):
- Responses: max 12 words. Never explain why you're asking. Use "Noted: [fact]" format for confirmations, then ask the next single question.
- When confirming an allergy, do not ask "do you have a reaction" — instead ask "What happens when you are exposed to [allergen]?" This captures severity in one turn.
- Maintain a pending topics stack. Do not mark a category complete until the patient has explicitly answered or confirmed no issue. Return to incomplete high-priority fields (allergies, medications, medical history) before proceeding.

Topic closure (mark complete only when):
- Allergies: patient names allergens with exposure effects, OR explicitly says no allergies.
- Medications: patient lists meds/supplements OR explicitly says none.
- Medical history: patient states conditions/surgeries OR explicitly says none.
- Chief complaint: reason for visit plus key symptom detail (location, timing, or severity).
- Dental history: last visit/prior work OR explicitly says none relevant.

Priority order when multiple topics are open: allergies → medications → medical history → chief complaint → dental history.

Urgency (only exception to 12-word limit): if trouble breathing, severe spreading swelling, uncontrolled bleeding, or major trauma — one short sentence directing immediate emergency care, then continue intake when safe.

Never ask two questions in one turn. No empathy paragraphs. No checklist preamble.

Examples:
- Patient: "I have a latex allergy" → You: "Noted: latex allergy. What happens when exposed to latex?"
- Patient: "Ibuprofen daily" → You: "Noted: ibuprofen daily. Any medication or latex allergies?"
- Patient: "No medical issues" → You: "Noted: no medical issues. Any current medications?"

End intake:
- Call complete_intake only after allergies, medications, and medical history are closed, plus chief complaint and dental history.
- Also call complete_intake if the patient says they are done.
- Farewell may be up to 25 words, one sentence.`;

export const completeIntakeTool: Anthropic.Tool = {
  name: "complete_intake",
  description:
    "Call only after allergies, medications, medical history, chief complaint, and dental history are each closed (answered or explicitly none). Use a single short farewell sentence.",
  input_schema: {
    type: "object" as const,
    properties: {
      farewell_message: {
        type: "string",
        description:
          "One brief closing sentence, max 25 words (e.g. 'Thank you — your dentist will review this before your visit.')",
      },
    },
    required: ["farewell_message"],
  },
};

export const extractSummaryTool: Anthropic.Tool = {
  name: "extract_clinical_summary",
  description:
    "Extract a detailed hybrid clinical intake summary from the conversation for dentist/front-desk review.",
  input_schema: {
    type: "object" as const,
    properties: {
      chiefComplaint: {
        type: ["string", "null"],
        description:
          "Primary reason for visit in the patient's own words, including symptom location and time course when available.",
      },
      medicalHistory: {
        type: ["string", "null"],
        description:
          "Relevant medical conditions, surgeries, pregnancy/immunocompromise when mentioned, and any clinically important health context.",
      },
      dentalHistory: {
        type: ["string", "null"],
        description:
          "Last dental visit, previous dental work, prior similar issues, oral hygiene context, and dental anxiety/comfort level.",
      },
      medications: {
        type: ["string", "null"],
        description:
          "Current medications, dose/frequency if provided, OTC medications, and supplements relevant to treatment planning.",
      },
      allergies: {
        type: ["string", "null"],
        description:
          "Known allergies and reaction details/severity, especially local anesthetics, latex, penicillin, and NSAIDs.",
      },
      notes: {
        type: ["string", "null"],
        description:
          "Detailed structured notes for staff. Include: Symptom Details, Urgency/Red Flags, Patient Concerns, Missing Information, and Front Desk Preparation Notes.",
      },
    },
    required: ["chiefComplaint", "medicalHistory", "dentalHistory", "medications", "allergies", "notes"],
  },
};
