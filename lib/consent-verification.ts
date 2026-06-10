export const CONSENT_INTRO_TEXT =
  "This visit uses an AI assistant to collect intake information before you see the dental team.";

export const CONSENT_REVIEW_TEXT =
  "In review, dental staff will review this recorded message for your records. Personally identifiable information will be removed and the anonymous data may be used to improve our processes.";

export const CONSENT_FULL_DISCLOSURE = `${CONSENT_INTRO_TEXT}\n\n${CONSENT_REVIEW_TEXT}`;

/** @deprecated Use CONSENT_FULL_DISCLOSURE */
export const CONSENT_SCREEN_TEXT = CONSENT_FULL_DISCLOSURE;

export const CONSENT_OPT_IN_QUESTION = "Do you want to use AI for intake?";

/** @deprecated Use CONSENT_OPT_IN_QUESTION */
export const CONSENT_AGREEMENT_QUESTION = CONSENT_OPT_IN_QUESTION;

export const CONSENT_AGREEMENT_RETRY = "Please answer yes or no: Do you want to use AI for intake?";

export const CONSENT_CLARIFICATION_MESSAGE =
  "This visit uses an AI assistant for intake. Staff will review the recording, PII is removed, and anonymized data may improve our processes. Do you want to use AI for intake?";

export const CONSENT_DECLINE_MESSAGE =
  "I understand. Please call the office to complete your intake with a staff member.";

export const INTAKE_WELCOME_MESSAGE = "Thank you. What brings you in today?";

export const NAME_PROMPT_MESSAGE =
  "Welcome to Edward's Dental. Our AI assistant is ready to help prepare for your visit. May we have your name? You can reply \"anonymous\" to continue without a name.";

export const INTAKE_CLOSING_QUESTION =
  "Is there anything else you'd like to add before we finish?";

/** Patient message sent when choosing Continue Anonymously from the start screen. */
export const ANONYMOUS_NAME_SENTINEL = "anonymous";

export type ConsentOutcome = "yes" | "no" | "question" | "unclear";

export function buildConsentAgreementPrompt(answer: string): string {
  return `The patient was shown these disclosures before being asked "${CONSENT_OPT_IN_QUESTION}":

Screen 1: "${CONSENT_INTRO_TEXT}"

Screen 2: "${CONSENT_REVIEW_TEXT}"

Patient answer: "${answer.trim()}"

Classify the patient's answer:
- YES if they clearly want to use AI for intake or accept (for example: yes, yeah, ok, sure, I agree, that's fine, got it, alright, or equivalent paraphrases).
- NO if they clearly decline AI intake or prefer staff (for example: no, nope, I don't want AI, I'd rather talk to a person, call the office).
- QUESTION if they ask what AI intake means, want the disclosure explained, or express confusion as a question (for example: what is AI intake?, what does that mean?, can you explain?).
- UNCLEAR if the answer is non-committal, unrelated, or vague without asking for explanation (for example: maybe, I don't know, hmm, or off-topic text that is not a clarification question).

Answer YES, NO, QUESTION, or UNCLEAR only.`;
}

export function parseConsentOutcome(response: string): ConsentOutcome {
  const normalized = response.trim().toUpperCase();
  if (normalized === "YES" || normalized.startsWith("YES")) return "yes";
  if (normalized === "NO" || normalized.startsWith("NO")) return "no";
  if (normalized === "QUESTION" || normalized.startsWith("QUESTION")) return "question";
  return "unclear";
}
