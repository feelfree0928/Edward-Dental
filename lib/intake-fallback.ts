/**
 * Rule-based intake behavior when Anthropic is unavailable (403, missing key, etc).
 * This keeps local consultations useful for demos and operational continuity.
 */

const DONE_PATTERN = /\b(done|finished|goodbye|that'?s all|no more|nothing else)\b/i;
const URGENT_PATTERN = /\b(trouble breathing|can't breathe|cannot breathe|swelling in face|uncontrolled bleeding|major trauma)\b/i;

const MEDICAL_PATTERN = /\b(medical|condition|diabetes|heart|blood pressure|asthma|surgery|hospital)\b/i;
const MEDICATION_PATTERN = /\b(medication|medicine|taking|prescription|aspirin|ibuprofen|acetaminophen|supplement)\b/i;
const ALLERGY_PATTERN = /\b(allerg|latex|penicillin|anesthetic|reaction|rash)\b/i;
const DENTAL_HISTORY_PATTERN = /\b(last dental|last visit|dentist|dental|cavity|filling|crown|root canal|cleaning)\b/i;
const SYMPTOM_PATTERN = /\b(pain|ache|throbbing|sharp|sensitive|swelling|bleeding|fever|jaw|tooth|gum)\b/i;

function normalize(text: string) {
  return text.toLowerCase().trim();
}

function includesAny(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function collectMatchingLines(lines: string[], pattern: RegExp): string[] {
  const matches: string[] = [];
  for (const line of lines) {
    if (pattern.test(line)) matches.push(line);
  }
  return [...new Set(matches)];
}

function firstSentence(text: string, max = 220) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function describeLastConcern(lastPatientMessage: string) {
  const text = normalize(lastPatientMessage);
  if (includesAny(text, /\b(tooth|molar|incisor|upper|lower|left|right)\b/i)) {
    return "that tooth issue";
  }
  if (includesAny(text, /\b(gum|gums)\b/i)) {
    return "that gum concern";
  }
  if (includesAny(text, /\b(swelling|bleeding)\b/i)) {
    return "those symptoms";
  }
  return "what you shared";
}

export function shouldCompleteIntake(patientMessageCount: number, lastPatientMessage: string) {
  const msg = normalize(lastPatientMessage);
  if (DONE_PATTERN.test(msg)) return true;
  return patientMessageCount >= 10;
}

export function generateFallbackReply(patientMessageCount: number, lastPatientMessage: string): string {
  const normalized = normalize(lastPatientMessage);
  const concern = describeLastConcern(lastPatientMessage);

  if (includesAny(normalized, URGENT_PATTERN)) {
    return "Thank you for telling me right away. Because this may be urgent, please seek immediate emergency dental or medical care now. If you can, let me know when these symptoms started so we can document it clearly for the team.";
  }

  if (patientMessageCount <= 1) {
    return "Thank you for explaining that so clearly. To help your dentist prepare, where exactly is the problem, when did it start, and how strong is it right now on a 0 to 10 scale?";
  }

  if (shouldCompleteIntake(patientMessageCount, lastPatientMessage)) {
    return "";
  }

  if (includesAny(normalized, /\b(anxious|nervous|scared|afraid)\b/i)) {
    return "I appreciate you sharing that, and we will make a note so the team can support you comfortably. Have you had any difficult dental experiences before, and is there anything that helps you feel more at ease during treatment?";
  }

  if (!includesAny(normalized, MEDICAL_PATTERN) && patientMessageCount >= 2 && patientMessageCount <= 4) {
    return `Thanks for sharing ${concern}. Do you have any medical conditions, recent surgeries, or health issues your dentist should know about?`;
  }

  if (!includesAny(normalized, MEDICATION_PATTERN) && patientMessageCount >= 3 && patientMessageCount <= 6) {
    return "Understood. Are you currently taking any medicines, including over-the-counter pain relievers or supplements?";
  }

  if (!includesAny(normalized, ALLERGY_PATTERN) && patientMessageCount >= 4 && patientMessageCount <= 7) {
    return "Thank you. Do you have any allergies to medications, latex, or local anesthetics, and what reaction do you get?";
  }

  if (!includesAny(normalized, DENTAL_HISTORY_PATTERN) && patientMessageCount >= 5) {
    return "One more quick question: when was your last dental visit, and have you had similar pain or treatment in this area before?";
  }

  return "Thank you, that is very helpful. Is there anything else about your symptoms, timing, or comfort concerns that you want your dentist to know before your visit?";
}

export const FALLBACK_FAREWELL =
  "Thank you for sharing all of that information. We have documented your concerns in detail so your dentist can review them before your appointment.";

export function isIntakeFallbackEnabled(): boolean {
  return process.env.ANTHROPIC_DEV_FALLBACK === "true" || process.env.ANTHROPIC_DEV_FALLBACK === "1";
}

export type FallbackSummaryRecord = {
  chief_complaint: string | null;
  medical_history: string | null;
  dental_history: string | null;
  medications: string | null;
  allergies: string | null;
  notes: string | null;
};

function joinMatches(lines: string[]) {
  if (lines.length === 0) return null;
  return lines.map((line) => `- ${firstSentence(line, 300)}`).join("\n");
}

function detectUrgencyFlags(lines: string[]) {
  const flags: string[] = [];
  if (lines.some((line) => /\b(swelling|swollen)\b/i.test(line))) flags.push("Facial or oral swelling reported");
  if (lines.some((line) => /\b(fever|chills)\b/i.test(line))) flags.push("Possible infection symptoms (fever/chills) reported");
  if (lines.some((line) => /\b(trauma|hit|injury|fell|fall)\b/i.test(line))) flags.push("Trauma-related dental concern reported");
  if (lines.some((line) => /\b(bleeding|bleed)\b/i.test(line))) flags.push("Bleeding reported");
  if (lines.some((line) => /\b(trouble breathing|can't breathe|cannot breathe|trouble swallowing)\b/i.test(line))) {
    flags.push("Airway/swallowing concern reported - urgent triage required");
  }
  return flags;
}

function buildMissingInfoNotes(lines: string[]) {
  const missing: string[] = [];
  if (!lines.some((line) => SYMPTOM_PATTERN.test(line))) missing.push("Symptom description remains limited");
  if (!lines.some((line) => /\b(start|since|day|week|month|today|yesterday|duration)\b/i.test(line))) {
    missing.push("Symptom timeline not clearly documented");
  }
  if (!lines.some((line) => /\b(scale|0|1|2|3|4|5|6|7|8|9|10|mild|severe)\b/i.test(line))) {
    missing.push("Pain severity score not clearly documented");
  }
  if (!lines.some((line) => MEDICAL_PATTERN.test(line))) missing.push("Medical history details may be incomplete");
  if (!lines.some((line) => MEDICATION_PATTERN.test(line))) missing.push("Medication list may be incomplete");
  if (!lines.some((line) => ALLERGY_PATTERN.test(line))) missing.push("Allergy status may be incomplete");
  return missing;
}

/** Build a richer hybrid clinical summary from patient messages when Claude is unavailable. */
export function extractFallbackSummary(
  messages: { role: string; content: string }[]
): FallbackSummaryRecord {
  const patientLines = messages
    .filter((m) => m.role === "patient")
    .map((m) => m.content.trim())
    .filter(Boolean);

  if (patientLines.length === 0) {
    return {
      chief_complaint: null,
      medical_history: null,
      dental_history: null,
      medications: null,
      allergies: null,
      notes: null,
    };
  }

  const chiefComplaint = firstSentence(patientLines[0], 380);
  const medicalMatches = collectMatchingLines(patientLines, MEDICAL_PATTERN);
  const dentalMatches = collectMatchingLines(patientLines, DENTAL_HISTORY_PATTERN);
  const medicationMatches = collectMatchingLines(patientLines, MEDICATION_PATTERN);
  const allergyMatches = collectMatchingLines(patientLines, ALLERGY_PATTERN);
  const symptomMatches = collectMatchingLines(patientLines, SYMPTOM_PATTERN);
  const urgencyFlags = detectUrgencyFlags(patientLines);
  const missingInfo = buildMissingInfoNotes(patientLines);
  const anxietyMentions = collectMatchingLines(patientLines, /\b(anxious|nervous|scared|afraid|dental anxiety)\b/i);

  const symptomSection =
    symptomMatches.length > 0
      ? symptomMatches.map((line) => `- ${firstSentence(line, 260)}`).join("\n")
      : "- Limited symptom detail captured in fallback mode";
  const urgencySection =
    urgencyFlags.length > 0
      ? urgencyFlags.map((flag) => `- ${flag}`).join("\n")
      : "- No explicit high-risk red flags reported in patient messages";
  const concernSection =
    anxietyMentions.length > 0
      ? anxietyMentions.map((line) => `- ${firstSentence(line, 220)}`).join("\n")
      : "- No explicit anxiety or special comfort request documented";
  const missingSection =
    missingInfo.length > 0
      ? missingInfo.map((item) => `- ${item}`).join("\n")
      : "- Key intake fields appear reasonably covered";

  const prepNotes = [
    "- Verify current pain severity score and symptom timeline at check-in",
    "- Confirm medication names/doses and allergy reactions before treatment planning",
    "- Re-screen for swelling, fever, trauma, or airway/swallowing issues if symptoms changed",
  ].join("\n");

  const notes = [
    "Auto-generated fallback summary (Claude API unavailable)",
    "",
    "Symptom Details:",
    symptomSection,
    "",
    "Possible Urgency Flags:",
    urgencySection,
    "",
    "Patient Concerns:",
    concernSection,
    "",
    "Missing Information:",
    missingSection,
    "",
    "Recommended Staff Follow-up:",
    prepNotes,
  ].join("\n");

  return {
    chief_complaint: chiefComplaint || null,
    medical_history: joinMatches(medicalMatches),
    dental_history: joinMatches(dentalMatches),
    medications: joinMatches(medicationMatches),
    allergies: joinMatches(allergyMatches),
    notes,
  };
}
