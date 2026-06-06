export const CONSENT_SCREEN_TEXT =
  "This conversation is recorded. Dental staff will review it and enter relevant information into your dental record. Your data is protected by law. It will not be sold. Personally identifiable information is removed and the anonymous data can be used to improve this system and dental care for everyone. You may stop anytime or skip questions.";

export const VERIFICATION_QUESTIONS = [
  "Who will review your conversation?",
  "Will your data be sold?",
  "Can your anonymized data be used to improve dental care for everyone?",
] as const;

export const INTAKE_WELCOME_MESSAGE = "Thank you. Now, what brings you in today?";

export type VerificationQuestionIndex = 1 | 2 | 3;

export function getVerificationCorrection(question: VerificationQuestionIndex): string {
  switch (question) {
    case 1:
      return "Not quite. Dental staff will review your conversation. Let me ask again: Who will review your conversation?";
    case 2:
      return "Not quite. Your data will not be sold. Let me ask again: Will your data be sold?";
    case 3:
      return "Not quite. Yes, anonymized data can be used to improve dental care for everyone. Let me ask again: Can your anonymized data be used to improve dental care for everyone?";
  }
}

const CONSENT_EVALUATION_PROMPTS: Record<VerificationQuestionIndex, string> = {
  1: "Does the patient's answer indicate they understand that dental staff will review their conversation?",
  2: "Does the patient's answer clearly say NO to data being sold?",
  3: "Does the patient's answer say YES to anonymous data being used to improve dental care?",
};

export function buildConsentEvaluationPrompt(
  questionIndex: VerificationQuestionIndex,
  answer: string
): string {
  const question = VERIFICATION_QUESTIONS[questionIndex - 1];
  const criterion = CONSENT_EVALUATION_PROMPTS[questionIndex];

  return `${criterion}

Verification question asked: "${question}"
Patient answer: "${answer.trim()}"

Accept natural language confirmations (for example: yes, yeah, ok, sure, I agree, got it, or accurate paraphrases).
Reject uncertain, wrong, or unrelated answers (for example: maybe, I don't know, or incorrect entities).

Answer YES or NO only.`;
}

/** Parse model output; only explicit YES counts as pass. */
export function parseYesNoOnly(response: string): boolean {
  const normalized = response.trim().toUpperCase();
  if (normalized === "YES" || normalized.startsWith("YES")) return true;
  return false;
}

/** Regex fallback when Claude is unavailable (demo / 403). */
export function evaluateVerificationAnswer(
  question: VerificationQuestionIndex,
  answer: string
): boolean {
  const normalized = answer.trim().toLowerCase();

  switch (question) {
    case 1:
      if (/\b(don'?t know|not sure|insurance|maybe)\b/.test(normalized)) return false;
      return (
        /\bdental\s*staff\b/.test(normalized) ||
        /\bdental\s*team\b/.test(normalized) ||
        /\bdentist\b/.test(normalized) ||
        /\byou guys\b/.test(normalized) ||
        /\bpeople who work\b/.test(normalized) ||
        /\bstaff\b/.test(normalized) ||
        /\bwill see\b/.test(normalized) ||
        /\bwill review\b/.test(normalized)
      );
    case 2:
      if (/\b(maybe|don'?t think|not sure|yes|probably|might)\b/.test(normalized)) return false;
      return (
        /^no\b/.test(normalized) ||
        /^nope\b/.test(normalized) ||
        /^ok\b/.test(normalized) ||
        /\bwill not\b/.test(normalized) ||
        /\bwon'?t\b/.test(normalized) ||
        /\bnot be sold\b/.test(normalized) ||
        /\bnot sold\b/.test(normalized) ||
        /\bdata won'?t\b/.test(normalized)
      );
    case 3:
      if (/\b(^no\b|nope|never|won'?t)\b/.test(normalized)) return false;
      return (
        /^yes\b/.test(normalized) ||
        /^yeah\b/.test(normalized) ||
        /^yep\b/.test(normalized) ||
        /^ok\b/.test(normalized) ||
        /^sure\b/.test(normalized) ||
        /^alright\b/.test(normalized) ||
        /\bi agree\b/.test(normalized) ||
        /\bgot it\b/.test(normalized) ||
        /\bsounds good\b/.test(normalized) ||
        /\bi understand\b/.test(normalized) ||
        /\bi guess so\b/.test(normalized) ||
        /\bit can\b/.test(normalized) ||
        /^correct\b/.test(normalized)
      );
  }
}
