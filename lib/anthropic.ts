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
        "Anthropic rejected this API key (403 Request not allowed). Create a new key at https://console.anthropic.com/settings/keys, enable billing and model access for your workspace, and ensure your region allows the API.",
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

export const INTAKE_MAX_WORDS = 20;
export const INTAKE_CLARIFICATION_MAX_WORDS = 35;
export const INTAKE_FAREWELL_MAX_WORDS = 25;
export const INTAKE_DEFAULT_FAREWELL =
  "Thank you — your dentist will review this before your visit.";

export const INTAKE_REPEAT_HINT =
  "The patient just repeated the same message. Answer their question directly with examples before re-asking. Do not repeat the same wording as your last reply.";

export function buildIntakeSystemPrompt(extraHint?: string): string {
  if (!extraHint?.trim()) return INTAKE_SYSTEM_PROMPT;
  return `${INTAKE_SYSTEM_PROMPT}\n\n${extraHint.trim()}`;
}

export function normalizePatientMessage(content: string): string {
  return content.trim().toLowerCase().replace(/[^\w\s']/g, "").replace(/\s+/g, " ");
}

export function isRepeatedPatientMessage(messages: { role: string; content: string }[]): boolean {
  const patientLines = messages
    .filter((m) => m.role === "patient")
    .map((m) => normalizePatientMessage(m.content));
  if (patientLines.length < 2) return false;
  const last = patientLines[patientLines.length - 1];
  return patientLines.slice(0, -1).some((prev) => prev === last);
}

export function getIntakeReplyWordLimit(reply: string): number {
  return reply.trim().toLowerCase().startsWith("noted:") ? INTAKE_MAX_WORDS : INTAKE_CLARIFICATION_MAX_WORDS;
}

export function enforceMaxWords(text: string | null | undefined, maxWords: number): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return trimmed;
  return words.slice(0, maxWords).join(" ");
}

export const INTAKE_SYSTEM_PROMPT = `You are the clinical intake assistant for Edward's Dental. Collect pre-visit facts only. Never diagnose or prescribe.

Response rules (strict):
- Noted confirmations: max 20 words. Clarification replies without "Noted:" may use up to 35 words.
- Use "Noted: [fact]" format for confirmations, then ask the next single question.
- Only use "Noted:" when the patient gave a factual answer or explicit denial (none, no, nope, nothing, nah, don't know about a reaction, or a stated condition/med/allergy). Never invent facts. If they did not say "no medical issues", do not write "Noted: no medical issues".
- Noted must echo the patient's actual answer — never use generic labels like "allergies recorded" after nope/none. After nope to allergies say "no allergies"; after nope to medications say "no medications".
- When chief complaint is known, briefly echo it before the first screening question (e.g. "tooth pain since last night").
- When confirming an allergy, do not ask "do you have a reaction" — instead ask "What happens when you are exposed to [allergen]?" This captures severity in one turn.
- Maintain a pending topics stack. Do not mark a category complete until the patient has explicitly answered or confirmed no issue.
- Accept no, nope, nothing, none, nah as valid answers for screening topics. Never re-ask or challenge those answers.

Non-answers (questions, confusion, off-topic):
- If the patient asks a question, requests clarification, or does not answer the current topic: do NOT use "Noted:", do NOT close the topic, do NOT advance to the next topic.
- Give a one-sentence clarification of what you are asking, then re-ask the same topic (or offer "or say none" / "or say don't know").
- Questions like "what are my options?", "what does that mean?", or "can you explain?" are NOT denials and NOT answers.

Context for "what are my options?" (use the open question from conversation):
- Screening (meds, conditions, allergies yes/no): they mean what can they say — "List items or say none." then re-ask.
- Allergy reaction follow-up: they mean what symptoms to report — "Examples: rash, swelling, trouble breathing—or say don't know." then re-ask once.
- Treatment or visit plan: they mean dental treatment — "Your dentist will discuss treatment at the visit." then re-ask the open intake question.

Loop-breaking:
- If the patient repeats the same question (especially "what are my options?") twice or more, stop rephrasing the same ask. First directly answer what they are asking (using context above), give concrete examples, then one short re-ask.
- Never ask the same screening or follow-up question more than 3 times without changing strategy or accepting "don't know".

Topic closure (mark complete only when):
- Allergies: patient names allergens with exposure effects, OR explicitly says no allergies, OR after naming an allergen says don't know/not sure/unsure about reaction (Noted: [allergen] allergy, reaction unknown).
- Medications: patient lists meds/supplements OR explicitly says none/nope/nothing.
- Medical history: patient states conditions/surgeries OR explicitly says none.
- Chief complaint: reason for visit plus key symptom detail. For pain complaints, always collect a zero-to-ten severity score before closing chief complaint — timing alone is not enough.
- Dental history: last visit/prior work OR explicitly says none relevant.

Priority order when multiple topics are open:
1. If patient states a reason for visit or symptom, ask one chief-complaint follow-up (location, timing, or severity) before screening.
2. Then allergies → medications → medical history.
3. Then any remaining chief-complaint detail (especially pain severity zero to ten) → dental history.

Urgency (exception to word limit): if trouble breathing, severe spreading swelling, uncontrolled bleeding, or major trauma — one short sentence directing immediate emergency care, then continue intake when safe.

Never ask two questions in one turn. No empathy paragraphs. No checklist preamble.

Examples:
- Patient: "Every haircut hurts" → You: "Noted: your concern. Where is the problem and when started?"
- Patient: "Nope" (to allergy question) → You: "Noted: no allergies. Any current medications or supplements?" (WRONG: "Noted: allergies recorded" after nope)
- Patient: "No anesthetic allergies" → You: "Noted: no allergies. Any current medications or supplements?"
- Patient: "I have a latex allergy" → You: "Noted: latex allergy. What happens when exposed to latex?"
- Patient: "food" → You: "Noted: food allergy. What happens when exposed to that food?"
- Patient: "what are my options?" (after reaction question) → WRONG: rephrase only → RIGHT: "Describe symptoms like rash or swelling, or say don't know. What happens with food?"
- Patient: "what are my options?" again → RIGHT: "Treatment plans come later; I need reaction symptoms or don't know. What happens with food?"
- Patient: "don't know" (after food allergy) → You: "Noted: food allergy, reaction unknown. Any current medications?"
- Patient: "Nope" (to medications) → You: "Noted: no medications. Any medical conditions or recent surgeries?"
- Patient: "No medical issues" → You: "Noted: no medical issues. When was your last dental visit?"
- Patient: "7" (after pain severity question) → You: "Noted: pain severity 7. When was your last dental visit?"
- Patient: "What are my options?" (after medical history question) → WRONG: "Noted: no medical issues. When was your last dental visit?" → RIGHT: "List any conditions or surgeries, or say none. Any medical conditions?"
- Patient: "What do you mean?" (after medications question) → You: "Any pills or supplements you take daily, or say none. Any medications?"
- Patient: "Huh?" (after allergy question) → You: "Any allergies to meds, latex, or foods, or say none. Any allergies?"

Allergy rules: "no X allergies" and "I don't have X allergy" mean no allergy — never treat as a positive finding or ask exposure follow-up. Never re-ask allergy screening after a clear denial.

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
