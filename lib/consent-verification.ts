export const CONSENT_SCREEN_TEXT =
  "This conversation is recorded. Dental staff will review it and enter relevant information into your dental record. Your data is protected by law. It will not be sold. Personally identifiable information is removed and the anonymous data can be used to improve this system and dental care for everyone. You may stop anytime or skip questions.";

export const CONSENT_AGREEMENT_QUESTION = "Do you agree?";

export const CONSENT_AGREEMENT_RETRY = "Please answer yes or no: Do you agree?";

export const CONSENT_DECLINE_MESSAGE =
  "I understand. Please call the office to complete your intake with a staff member.";

export const INTAKE_WELCOME_MESSAGE = "Thank you. What brings you in today?";

export type ConsentOutcome = "yes" | "no" | "unclear";

export function buildConsentAgreementPrompt(answer: string): string {
  return `The patient was shown this disclosure before being asked "Do you agree?":

"${CONSENT_SCREEN_TEXT}"

Patient answer: "${answer.trim()}"

Classify the patient's answer:
- YES if they clearly agree or accept (for example: yes, yeah, ok, sure, I agree, got it, alright, or equivalent paraphrases).
- NO if they clearly decline or refuse (for example: no, nope, I don't agree, I don't want to).
- UNCLEAR if the answer is ambiguous, unrelated, or shows confusion (for example: maybe, I don't know, what does that mean, or off-topic text).

Answer YES, NO, or UNCLEAR only.`;
}

export function parseConsentOutcome(response: string): ConsentOutcome {
  const normalized = response.trim().toUpperCase();
  if (normalized === "YES" || normalized.startsWith("YES")) return "yes";
  if (normalized === "NO" || normalized.startsWith("NO")) return "no";
  return "unclear";
}
