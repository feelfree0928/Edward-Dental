export const CONSENT_SCREEN_TEXT =
  "This conversation is recorded. Dental staff will review it and enter relevant information into your dental record. Your data is protected by law. It will not be sold. Personally identifiable information is removed and the anonymous data can be used to improve this system and dental care for everyone. You may stop anytime or skip questions.";

export const CONSENT_AGREEMENT_QUESTION = "Do you agree?";

export const CONSENT_AGREEMENT_RETRY = "Please answer yes or no: Do you agree?";

export const CONSENT_CLARIFICATION_MESSAGE =
  "You're agreeing that this chat is recorded, dental staff will review it for your record, your data is protected and won't be sold, anonymized data may be used to improve care, and you can stop anytime. Do you agree?";

export const CONSENT_DECLINE_MESSAGE =
  "I understand. Please call the office to complete your intake with a staff member.";

export const INTAKE_WELCOME_MESSAGE = "Thank you. What brings you in today?";

export type ConsentOutcome = "yes" | "no" | "question" | "unclear";

export function buildConsentAgreementPrompt(answer: string): string {
  return `The patient was shown this disclosure before being asked "Do you agree?":

"${CONSENT_SCREEN_TEXT}"

Patient answer: "${answer.trim()}"

Classify the patient's answer:
- YES if they clearly agree or accept (for example: yes, yeah, ok, sure, I agree, got it, alright, or equivalent paraphrases).
- NO if they clearly decline or refuse (for example: no, nope, I don't agree, I don't want to).
- QUESTION if they ask what they are agreeing to, want the disclosure explained, or express confusion as a question (for example: agree to what?, what am I agreeing to?, can you explain?, what does that mean?).
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
