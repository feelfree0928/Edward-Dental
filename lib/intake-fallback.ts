/**
 * Rule-based intake behavior when Anthropic is unavailable (403, missing key, etc).
 * Mirrors terse, field-driven rules from INTAKE_SYSTEM_PROMPT.
 */

import { INTAKE_FAREWELL_MAX_WORDS, INTAKE_MAX_WORDS, enforceMaxWords } from "@/lib/anthropic";

const DONE_PATTERN = /\b(done|finished|goodbye|that'?s all|no more|nothing else)\b/i;
const URGENT_PATTERN = /\b(trouble breathing|can't breathe|cannot breathe|swelling in face|uncontrolled bleeding|major trauma)\b/i;

const NO_ALLERGY_PATTERN = /\b(no allergies|no allergy|not allergic|no known allergies|none)\b/i;
const ALLERGEN_PATTERN = /\b(latex|penicillin|anesthetic|anesthesia|nickel|codeine|sulfa|aspirin)\b/i;
const EXPOSURE_PATTERN =
  /\b(exposed|exposure|hives|rash|swell|anaphylaxis|itch|wheez|breath|nausea|vomit|dizzy|faint|throat|when i|reaction is|it causes|i get)\b/i;

const NO_MEDICATION_PATTERN = /\b(no medications|no medication|not taking any|don't take any|do not take any|none)\b/i;
const MEDICATION_PATTERN =
  /\b(medication|medicine|taking|prescription|aspirin|ibuprofen|acetaminophen|supplement|daily|mg)\b/i;

const NO_MEDICAL_PATTERN = /\b(no medical|no conditions|no health issues|nothing serious|healthy|none)\b/i;
const MEDICAL_PATTERN = /\b(medical|condition|diabetes|heart|blood pressure|asthma|surgery|hospital)\b/i;

const NO_DENTAL_PATTERN = /\b(no dental|never been|not sure|none)\b/i;
const DENTAL_HISTORY_PATTERN = /\b(last dental|last visit|dentist|dental|cavity|filling|crown|root canal|cleaning|years ago)\b/i;

const ALLERGY_PATTERN = /\b(allerg|latex|penicillin|anesthetic|reaction|rash)\b/i;
const SYMPTOM_PATTERN = /\b(pain|ache|throbbing|sharp|sensitive|swelling|bleeding|fever|jaw|tooth|gum)\b/i;
const TIMELINE_PATTERN = /\b(start|since|day|week|month|today|yesterday|duration|ago)\b/i;
const SEVERITY_PATTERN = /\b(scale|0|1|2|3|4|5|6|7|8|9|10|mild|moderate|severe|out of)\b/i;
const LOCATION_PATTERN = /\b(upper|lower|left|right|front|back|molar|incisor|side)\b/i;

export type TopicStatus = "open" | "partial" | "closed";

export type IntakeTopicState = {
  allergies: TopicStatus;
  medications: TopicStatus;
  medical_history: TopicStatus;
  chief_complaint: TopicStatus;
  dental_history: TopicStatus;
};

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

function extractAllergen(text: string): string {
  const n = normalize(text);
  if (/\blatex\b/.test(n)) return "latex";
  if (/\bpenicillin\b/.test(n)) return "penicillin";
  if (/\banesthetic|anesthesia\b/.test(n)) return "anesthetic";
  if (/\bnickel\b/.test(n)) return "nickel";
  if (/\baspirin\b/.test(n)) return "aspirin";
  if (/\ballerg/i.test(n)) return "that allergen";
  return "it";
}

export function getIntakeTopicState(patientLines: string[]): IntakeTopicState {
  const joined = patientLines.join(" ");

  let allergies: TopicStatus = "open";
  if (patientLines.some((l) => NO_ALLERGY_PATTERN.test(l))) {
    allergies = "closed";
  } else if (patientLines.some((l) => ALLERGEN_PATTERN.test(l) || /\ballerg/i.test(l))) {
    const hasExposure =
      patientLines.some((l) => EXPOSURE_PATTERN.test(l)) ||
      (ALLERGEN_PATTERN.test(joined) && EXPOSURE_PATTERN.test(joined));
    allergies = hasExposure ? "closed" : "partial";
  }

  let medications: TopicStatus = "open";
  if (patientLines.some((l) => NO_MEDICATION_PATTERN.test(l) && !ALLERGEN_PATTERN.test(l))) {
    medications = "closed";
  } else if (patientLines.some((l) => MEDICATION_PATTERN.test(l))) {
    medications = "closed";
  }

  let medical_history: TopicStatus = "open";
  if (patientLines.some((l) => NO_MEDICAL_PATTERN.test(l))) {
    medical_history = "closed";
  } else if (patientLines.some((l) => MEDICAL_PATTERN.test(l))) {
    medical_history = "closed";
  }

  let chief_complaint: TopicStatus = "open";
  if (patientLines.length > 0) {
    const hasSymptom = patientLines.some((l) => SYMPTOM_PATTERN.test(l));
    const hasDetail =
      patientLines.some((l) => TIMELINE_PATTERN.test(l) || SEVERITY_PATTERN.test(l) || LOCATION_PATTERN.test(l));
    if (hasSymptom && hasDetail) chief_complaint = "closed";
    else if (hasSymptom || patientLines.length >= 1) chief_complaint = "partial";
  }

  let dental_history: TopicStatus = "open";
  if (patientLines.some((l) => NO_DENTAL_PATTERN.test(l) && DENTAL_HISTORY_PATTERN.test(l) === false)) {
    if (/\b(no|none)\b/i.test(patientLines.join(" ")) && patientLines.length >= 4) {
      dental_history = "closed";
    }
  }
  if (patientLines.some((l) => DENTAL_HISTORY_PATTERN.test(l))) {
    dental_history = "closed";
  }

  return { allergies, medications, medical_history, chief_complaint, dental_history };
}

export function areHighPriorityTopicsClosed(state: IntakeTopicState): boolean {
  return (
    state.allergies === "closed" &&
    state.medications === "closed" &&
    state.medical_history === "closed"
  );
}

export function shouldCompleteIntake(patientLines: string[], lastPatientMessage: string): boolean {
  const msg = normalize(lastPatientMessage);
  if (DONE_PATTERN.test(msg)) return true;

  const state = getIntakeTopicState(patientLines);
  if (!areHighPriorityTopicsClosed(state)) return false;

  return state.chief_complaint === "closed" && state.dental_history === "closed";
}

function notedQuestion(notation: string, question: string): string {
  return enforceMaxWords(`Noted: ${notation}. ${question}`, INTAKE_MAX_WORDS);
}

export function generateFallbackReply(patientLines: string[], lastPatientMessage: string): string {
  const normalized = normalize(lastPatientMessage);

  if (includesAny(normalized, URGENT_PATTERN)) {
    return "Seek emergency care now for breathing trouble, severe swelling, or uncontrolled bleeding.";
  }

  const state = getIntakeTopicState(patientLines);

  if (state.allergies === "partial") {
    const allergen = extractAllergen(lastPatientMessage) || extractAllergen(patientLines.join(" "));
    return notedQuestion(
      `${allergen} allergy`,
      `What happens when exposed to ${allergen}?`
    );
  }

  if (state.allergies === "open") {
    return notedQuestion("your update", "Any medication, latex, or anesthetic allergies?");
  }

  if (state.medications === "open") {
    return notedQuestion("allergies recorded", "Any current medications or supplements?");
  }

  if (state.medical_history === "open") {
    return notedQuestion("medications recorded", "Any medical conditions or recent surgeries?");
  }

  if (state.chief_complaint !== "closed") {
    if (state.chief_complaint === "open" && patientLines.length <= 1) {
      return notedQuestion("your concern", "Where is the problem and when started?");
    }
    return notedQuestion("symptoms noted", "Pain severity zero to ten?");
  }

  if (state.dental_history === "open") {
    return notedQuestion("history noted", "When was your last dental visit?");
  }

  return notedQuestion("intake complete", "Anything else for the dentist?");
}

export const FALLBACK_FAREWELL = enforceMaxWords(
  "Thank you — your dentist will review this before your visit.",
  INTAKE_FAREWELL_MAX_WORDS
);

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
  const state = getIntakeTopicState(lines);
  const missing: string[] = [];
  if (state.chief_complaint !== "closed") missing.push("Chief complaint details may be incomplete");
  if (state.allergies !== "closed") missing.push("Allergy status may be incomplete");
  if (state.medications !== "closed") missing.push("Medication list may be incomplete");
  if (state.medical_history !== "closed") missing.push("Medical history details may be incomplete");
  if (state.dental_history !== "closed") missing.push("Dental history may be incomplete");
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
