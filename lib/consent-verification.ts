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

export function evaluateVerificationAnswer(
  question: VerificationQuestionIndex,
  answer: string
): boolean {
  const normalized = answer.trim().toLowerCase();

  switch (question) {
    case 1:
      return (
        /\bdental\s*staff\b/.test(normalized) ||
        /\bdental\s*team\b/.test(normalized) ||
        /\bdentist\s*(and\s*)?staff\b/.test(normalized) ||
        /\bthe\s*dentist\b/.test(normalized)
      );
    case 2:
      return (
        /^no\b/.test(normalized) ||
        /^nope\b/.test(normalized) ||
        /\bwill not be sold\b/.test(normalized) ||
        /\bnot be sold\b/.test(normalized) ||
        /\bnot sold\b/.test(normalized)
      );
    case 3:
      return (
        /^yes\b/.test(normalized) ||
        /^yeah\b/.test(normalized) ||
        /\bit can\b/.test(normalized) ||
        /^correct\b/.test(normalized)
      );
  }
}
