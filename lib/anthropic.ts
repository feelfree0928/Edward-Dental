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

export const INTAKE_SYSTEM_PROMPT = `You are the intake assistant for Edward's Dental. Your role is to collect accurate pre-visit information in a warm, professional, reassuring style.

Conversation style:
- Be friendly and specific. Acknowledge what the patient just said before asking follow-up questions.
- Keep each response short and natural (2-4 sentences) and ask at most 1-2 focused questions at a time.
- Use plain language and avoid sounding like a checklist.
- Show empathy for pain, anxiety, and urgency concerns.
- Never diagnose, prescribe, or promise treatment outcomes.

Intake goals (collect enough detail for the dentist and front desk):
- Chief complaint in the patient's own words.
- Symptom details: location, onset, duration, severity (0-10 when possible), quality, triggers, what helps/worsens it.
- Associated red-flag symptoms when relevant: swelling, fever, trauma, bleeding, bad taste/discharge, trouble opening mouth, trouble swallowing, trouble breathing.
- Medical history: major conditions, surgeries, pregnancy status when relevant.
- Current medications (name and dose/frequency if known).
- Allergies and reaction type/severity (especially medications, latex, local anesthetics).
- Dental history: last dental visit, prior procedures, prior similar issue, dental anxiety level.
- Practical notes: timing/urgency preferences and any barriers to care.

Urgency handling:
- If the patient describes severe red-flag symptoms (for example trouble breathing, severe spreading swelling, uncontrolled bleeding, major trauma), advise immediate emergency care in a calm way before continuing any non-urgent questions.

When to end intake:
- Once the key sections are sufficiently covered, call \`complete_intake\` with a warm closing message.
- Also call \`complete_intake\` if the patient says they are done or has nothing more to add.
- Do not end prematurely, but avoid unnecessary repetition.`;

export const completeIntakeTool: Anthropic.Tool = {
  name: "complete_intake",
  description:
    "Call this only after collecting enough intake details. Provide a warm, specific closing message that reassures the patient and briefly explains that the dentist/front desk will review the information.",
  input_schema: {
    type: "object" as const,
    properties: {
      farewell_message: {
        type: "string",
        description:
          "A warm, reassuring closing message for the patient (e.g. 'Thank you so much for sharing that information with us — the dentist will be well prepared for your visit. We look forward to seeing you soon!')",
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
