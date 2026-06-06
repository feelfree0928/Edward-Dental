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

const NO_MEDICATION_PATTERN =
  /\b(no current medications?|no medications?|not taking any|don't take any|do not take any|not on any|zero medications?|none)\b/i;
const MEDICATION_PATTERN =
  /\b(medications?|medicines?|supplements?|prescription|aspirin|ibuprofen|acetaminophen|daily|mg)\b/i;

const NO_MEDICAL_PATTERN =
  /\b(no medical|no conditions|no health issues|nothing serious|healthy|none)\b/i;
const MEDICAL_PATTERN = /\b(medical|condition|diabetes|heart|blood pressure|asthma|surgery|hospital)\b/i;

const NO_DENTAL_PATTERN = /\b(no dental|never been|not sure|none)\b/i;
const DENTAL_HISTORY_PATTERN =
  /\b(last dental|last visit|first visit|first time|never been|dentist|dental|cavity|filling|crown|root canal|cleaning|years ago)\b/i;
const PAIN_SYMPTOM_PATTERN = /\b(pain|ache|throbbing|hurt|hurts|sore|tender)\b/i;

const ALLERGY_PATTERN = /\b(allerg|latex|penicillin|anesthetic|reaction|rash)\b/i;
const SYMPTOM_PATTERN =
  /\b(pain|ache|throbbing|sharp|sensitive|swelling|bleeding|fever|jaw|tooth|gum|hurt|hurts|sore|tender|uncomfortable)\b/i;
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

export function hasChiefComplaintSignal(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  return (
    SYMPTOM_PATTERN.test(n) ||
    /\b(bother|concern|problem|issue|visit|checkup|cleaning|broken|cracked|loose|brings me)\b/.test(n)
  );
}

function hasChiefComplaintDetail(patientLines: string[]) {
  return {
    hasTimeline: patientLines.some((l) => TIMELINE_PATTERN.test(l)),
    hasLocation: patientLines.some((l) => LOCATION_PATTERN.test(l)),
    hasSeverity: patientLines.some((l) => SEVERITY_PATTERN.test(l)),
  };
}

function isWelcomeMessage(message: string): boolean {
  return /what brings you in today/i.test(message);
}

function isChiefComplaintQuestion(message: string): boolean {
  if (isWelcomeMessage(message)) return false;
  return inferTopicFromAssistantMessage(message) === "chief_complaint";
}

function shouldExploreChiefComplaintBeforeScreening(
  state: IntakeTopicState,
  patientLines: string[],
  lastAssistantMessage?: string
): boolean {
  if (state.chief_complaint === "closed") return false;
  if (!patientLines.some((l) => hasChiefComplaintSignal(l))) return false;
  if (state.allergies !== "open" || state.medications !== "open" || state.medical_history !== "open") {
    return false;
  }
  if (lastAssistantMessage && isChiefComplaintQuestion(lastAssistantMessage)) {
    return false;
  }
  return true;
}

function getChiefComplaintFollowUp(patientLines: string[]): string {
  const details = hasChiefComplaintDetail(patientLines);
  const hasPain = patientLines.some((l) => PAIN_SYMPTOM_PATTERN.test(l));

  if (patientLines.length <= 1 || (!details.hasTimeline && !details.hasLocation)) {
    if (hasPain && patientLines.length <= 1) {
      return notedQuestion("your concern", "When did this pain start?");
    }
    return notedQuestion("your concern", "Where is the problem and when started?");
  }
  if (!details.hasSeverity && (hasPain || details.hasTimeline || details.hasLocation)) {
    return notedQuestion("symptoms noted", "Pain severity zero to ten?");
  }
  if (!details.hasLocation) {
    return notedQuestion("symptoms noted", "Where is the problem located?");
  }
  if (!details.hasTimeline) {
    return notedQuestion("symptoms noted", "When did symptoms start?");
  }
  return notedQuestion("symptoms noted", "Pain severity zero to ten?");
}

export function isNegativeNoneAnswer(text: string): boolean {
  const n = normalize(text).replace(/[.!?,]+$/g, "");
  if (!n) return false;

  if (/^(nothing|nothign|nothin|nithing|nuthing|nothingg|nope|nah|no|none|nada|zero|zip)$/.test(n)) {
    return true;
  }
  if (/\bno current medications?\b/.test(n)) return true;
  if (/\bno medications?\b/.test(n)) return true;
  if (/\bnot (taking|on) (any|meds|medications?|medicines?|supplements?)\b/.test(n)) return true;
  if (/\b(don'?t|do not) take (any|meds|medications?)\b/.test(n)) return true;
  if (/\bno (meds|medicines?|supplements?)\b/.test(n)) return true;

  return false;
}

function isExplicitAllergyDenial(text: string): boolean {
  const n = normalize(text);
  if (/\bno\s+[\w\s]*allerg/.test(n)) return true;
  if (/\bno\s+(latex|penicillin|anesthetic|anesthesia|nickel|codeine|sulfa|aspirin)\b/.test(n)) {
    return true;
  }
  if (/\b(don'?t|do not)\s+have\s+[\w\s]*allerg/.test(n)) return true;
  if (/\bi\s+have\s+no\s+[\w\s]*allerg/.test(n)) return true;
  if (/\bnot\s+allergic\b/.test(n)) return true;
  return false;
}

function isNoMedicationsAnswer(text: string): boolean {
  const n = normalize(text);
  if (ALLERGEN_PATTERN.test(n) && /\ballerg/i.test(n)) return false;
  return NO_MEDICATION_PATTERN.test(n) || isNegativeNoneAnswer(text);
}

function isMedicationListAnswer(text: string): boolean {
  if (isNoMedicationsAnswer(text)) return false;
  const n = normalize(text);
  return MEDICATION_PATTERN.test(n) || /\btaking\b/.test(n);
}

function isNoAllergyAnswer(text: string): boolean {
  return NO_ALLERGY_PATTERN.test(text) || isExplicitAllergyDenial(text) || isNegativeNoneAnswer(text);
}

function isNoMedicalHistoryAnswer(text: string): boolean {
  return NO_MEDICAL_PATTERN.test(text) || isNegativeNoneAnswer(text);
}

type AssistantTopic = "allergies" | "medications" | "medical_history" | "chief_complaint" | "dental_history";

function getAssistantQuestionPart(message: string): string {
  const parts = message.split(/\.\s+/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : message;
}

function inferTopicFromAssistantMessage(message: string): AssistantTopic | null {
  const full = normalize(message);
  if (/exposed to|what happens when/.test(full)) return "allergies";

  const n = normalize(getAssistantQuestionPart(message));
  if (/allerg|latex|anesthetic/.test(n)) return "allergies";
  if (/medications recorded/.test(n)) return "medical_history";
  if (/medications?|supplements?|meds/.test(n)) return "medications";
  if (/medical conditions|surgeries|health issues/.test(n)) return "medical_history";
  if (
    /severity|zero to ten|where is the problem|when started|when did|pain start|your concern|symptoms noted/.test(n)
  ) {
    return "chief_complaint";
  }
  if (/dental visit|last visit/.test(n)) return "dental_history";
  return null;
}

function extractAllergen(text: string): string | null {
  if (isExplicitAllergyDenial(text) || isNoAllergyAnswer(text)) return null;
  const n = normalize(text);
  if (/\blatex\b/.test(n)) return "latex";
  if (/\bpenicillin\b/.test(n)) return "penicillin";
  if (/\banesthetic|anesthesia\b/.test(n)) return "anesthetic";
  if (/\bnickel\b/.test(n)) return "nickel";
  if (/\baspirin\b/.test(n)) return "aspirin";
  if (/\ballerg/i.test(n)) return "that allergen";
  return null;
}

function findAffirmativeAllergen(patientLines: string[]): string | null {
  for (let i = patientLines.length - 1; i >= 0; i--) {
    const allergen = extractAllergen(patientLines[i]);
    if (allergen) return allergen;
  }
  return null;
}

export type IntakeTopicOptions = {
  lastPatientMessage?: string;
  lastAssistantMessage?: string;
};

function applyContextualClosure(
  state: IntakeTopicState,
  lastPatientMessage: string,
  lastAssistantMessage: string
): IntakeTopicState {
  const topic = inferTopicFromAssistantMessage(lastAssistantMessage);
  if (!topic) return state;

  const next = { ...state };

  if (topic === "allergies") {
    if (isNoAllergyAnswer(lastPatientMessage) || isExplicitAllergyDenial(lastPatientMessage)) {
      next.allergies = "closed";
    } else if (
      !isExplicitAllergyDenial(lastPatientMessage) &&
      (ALLERGEN_PATTERN.test(lastPatientMessage) || /\ballerg/i.test(lastPatientMessage))
    ) {
      next.allergies = EXPOSURE_PATTERN.test(lastPatientMessage) ? "closed" : "partial";
    }
  }
  if (topic === "medical_history" && (isNoMedicalHistoryAnswer(lastPatientMessage) || MEDICAL_PATTERN.test(lastPatientMessage))) {
    next.medical_history = "closed";
    next.medications = "closed";
    next.allergies = "closed";
  }
  if (topic === "medications" && (isNoMedicationsAnswer(lastPatientMessage) || isMedicationListAnswer(lastPatientMessage))) {
    next.medications = "closed";
    next.allergies = "closed";
  }
  if (topic === "chief_complaint" && SEVERITY_PATTERN.test(lastPatientMessage)) {
    next.chief_complaint = "closed";
  }
  if (topic === "dental_history" && (isNegativeNoneAnswer(lastPatientMessage) || DENTAL_HISTORY_PATTERN.test(lastPatientMessage))) {
    next.dental_history = "closed";
  }

  return next;
}

export function getIntakeTopicState(
  patientLines: string[],
  options?: IntakeTopicOptions
): IntakeTopicState {
  const joined = patientLines.join(" ");
  const terseDenialCount = patientLines.filter((l) => isNegativeNoneAnswer(l)).length;
  const screeningDenialsComplete = terseDenialCount >= 3;

  let allergies: TopicStatus = "open";
  if (screeningDenialsComplete || patientLines.some((l) => isNoAllergyAnswer(l))) {
    allergies = "closed";
  } else if (
    patientLines.some(
      (l) => !isExplicitAllergyDenial(l) && (ALLERGEN_PATTERN.test(l) || /\ballerg/i.test(l))
    )
  ) {
    const hasExposure =
      patientLines.some((l) => EXPOSURE_PATTERN.test(l)) ||
      (ALLERGEN_PATTERN.test(joined) && EXPOSURE_PATTERN.test(joined));
    allergies = hasExposure ? "closed" : "partial";
  }

  let medications: TopicStatus = "open";
  if (
    screeningDenialsComplete ||
    patientLines.some((l) => NO_MEDICATION_PATTERN.test(normalize(l)) && !ALLERGEN_PATTERN.test(l))
  ) {
    medications = "closed";
  } else if (patientLines.some((l) => isMedicationListAnswer(l))) {
    medications = "closed";
  }

  let medical_history: TopicStatus = "open";
  if (screeningDenialsComplete || patientLines.some((l) => NO_MEDICAL_PATTERN.test(l))) {
    medical_history = "closed";
  } else if (patientLines.some((l) => MEDICAL_PATTERN.test(l))) {
    medical_history = "closed";
  }

  let chief_complaint: TopicStatus = "open";
  if (patientLines.length > 0) {
    const hasSymptom = patientLines.some((l) => SYMPTOM_PATTERN.test(l) || hasChiefComplaintSignal(l));
    const hasPain = patientLines.some((l) => PAIN_SYMPTOM_PATTERN.test(l));
    const hasTimeline = patientLines.some((l) => TIMELINE_PATTERN.test(l));
    const hasLocation = patientLines.some((l) => LOCATION_PATTERN.test(l));
    const hasSeverity = patientLines.some((l) => SEVERITY_PATTERN.test(l));
    if (hasSymptom && hasPain && hasSeverity) {
      chief_complaint = "closed";
    } else if (hasSymptom && !hasPain && (hasTimeline || hasLocation || hasSeverity)) {
      chief_complaint = "closed";
    } else if (hasSymptom || patientLines.length >= 1) {
      chief_complaint = "partial";
    }
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

  const base = { allergies, medications, medical_history, chief_complaint, dental_history };

  if (options?.lastPatientMessage && options?.lastAssistantMessage) {
    return applyContextualClosure(base, options.lastPatientMessage, options.lastAssistantMessage);
  }

  return base;
}

export function areHighPriorityTopicsClosed(state: IntakeTopicState): boolean {
  return (
    state.allergies === "closed" &&
    state.medications === "closed" &&
    state.medical_history === "closed"
  );
}

export function shouldCompleteIntake(
  patientLines: string[],
  lastPatientMessage: string,
  lastAssistantMessage?: string
): boolean {
  const msg = normalize(lastPatientMessage);
  if (DONE_PATTERN.test(msg)) return true;

  const state = getIntakeTopicState(patientLines, {
    lastPatientMessage,
    lastAssistantMessage,
  });
  if (!areHighPriorityTopicsClosed(state)) return false;

  return state.chief_complaint === "closed" && state.dental_history === "closed";
}

function truncateEcho(text: string, maxWords = 5): string {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function summarizeChiefComplaint(patientLines: string[]): string | null {
  const symptomLine = patientLines.find((l) => SYMPTOM_PATTERN.test(l) || hasChiefComplaintSignal(l));
  if (!symptomLine) return null;

  const timelineLine = patientLines.find((l) => l !== symptomLine && TIMELINE_PATTERN.test(l));
  let summary = symptomLine.trim().toLowerCase();
  if (timelineLine) {
    summary = `${summary} ${timelineLine.trim().toLowerCase()}`;
  }
  return truncateEcho(summary, 3) || null;
}

function buildTopicConfirmation(
  lastPatientMessage: string,
  lastAssistantMessage: string | undefined
): string | null {
  if (!lastAssistantMessage) return null;

  const topic = inferTopicFromAssistantMessage(lastAssistantMessage);
  if (!topic) return null;

  if (topic === "allergies") {
    if (isNoAllergyAnswer(lastPatientMessage) || isExplicitAllergyDenial(lastPatientMessage)) {
      return "no allergies";
    }
    const allergen = extractAllergen(lastPatientMessage);
    if (allergen) return `${allergen} allergy`;
    if (EXPOSURE_PATTERN.test(lastPatientMessage)) return "allergy reaction noted";
    return null;
  }

  if (topic === "medications") {
    if (isNoMedicationsAnswer(lastPatientMessage)) return "no medications";
    if (isMedicationListAnswer(lastPatientMessage)) return truncateEcho(lastPatientMessage);
    return null;
  }

  if (topic === "medical_history") {
    if (isNoMedicalHistoryAnswer(lastPatientMessage)) return "no medical issues";
    if (MEDICAL_PATTERN.test(lastPatientMessage)) return truncateEcho(lastPatientMessage);
    return null;
  }

  if (topic === "chief_complaint" && lastPatientMessage.trim()) {
    const n = normalize(lastPatientMessage);
    const score = n.match(/\b(10|[0-9])\b/)?.[1];
    if (score && SEVERITY_PATTERN.test(n)) return `pain severity ${score}`;
    if (/\b(mild|moderate|severe)\b/.test(n)) return `pain ${n.match(/\b(mild|moderate|severe)\b/)![1]}`;
    return truncateEcho(lastPatientMessage);
  }

  return null;
}

function advanceWithConfirmation(
  lastPatientMessage: string,
  lastAssistantMessage: string | undefined,
  fallbackNotation: string,
  nextQuestion: string
): string {
  const confirmation = buildTopicConfirmation(lastPatientMessage, lastAssistantMessage);
  return notedQuestion(confirmation ?? fallbackNotation, nextQuestion);
}

function notedQuestion(notation: string, question: string): string {
  return enforceMaxWords(`Noted: ${notation}. ${question}`, INTAKE_MAX_WORDS);
}

export function generateFallbackReply(
  patientLines: string[],
  lastPatientMessage: string,
  lastAssistantMessage?: string
): string {
  const normalized = normalize(lastPatientMessage);

  if (includesAny(normalized, URGENT_PATTERN)) {
    return "Seek emergency care now for breathing trouble, severe swelling, or uncontrolled bleeding.";
  }

  const state = getIntakeTopicState(patientLines, {
    lastPatientMessage,
    lastAssistantMessage,
  });

  if (
    patientLines.length === 1 &&
    (!lastAssistantMessage || isWelcomeMessage(lastAssistantMessage)) &&
    hasChiefComplaintSignal(lastPatientMessage)
  ) {
    return getChiefComplaintFollowUp(patientLines);
  }

  if (shouldExploreChiefComplaintBeforeScreening(state, patientLines, lastAssistantMessage)) {
    return getChiefComplaintFollowUp(patientLines);
  }

  if (state.allergies === "partial") {
    if (isNoAllergyAnswer(lastPatientMessage) || isExplicitAllergyDenial(lastPatientMessage)) {
      return advanceWithConfirmation(
        lastPatientMessage,
        lastAssistantMessage,
        "no allergies",
        "Any current medications or supplements?"
      );
    }
    const allergen = extractAllergen(lastPatientMessage) || findAffirmativeAllergen(patientLines);
    if (!allergen) {
      return advanceWithConfirmation(
        lastPatientMessage,
        lastAssistantMessage,
        "no allergies",
        "Any current medications or supplements?"
      );
    }
    return notedQuestion(
      `${allergen} allergy`,
      `What happens when exposed to ${allergen}?`
    );
  }

  if (state.allergies === "open") {
    const notation = summarizeChiefComplaint(patientLines) ?? "your concern";
    return notedQuestion(notation, "Any medication, latex, or anesthetic allergies?");
  }

  if (state.medications === "open") {
    return advanceWithConfirmation(
      lastPatientMessage,
      lastAssistantMessage,
      "allergies recorded",
      "Any current medications or supplements?"
    );
  }

  if (state.medical_history === "open") {
    return advanceWithConfirmation(
      lastPatientMessage,
      lastAssistantMessage,
      "medications recorded",
      "Any medical conditions or recent surgeries?"
    );
  }

  if (state.chief_complaint !== "closed") {
    return getChiefComplaintFollowUp(patientLines);
  }

  if (state.dental_history === "open") {
    return advanceWithConfirmation(
      lastPatientMessage,
      lastAssistantMessage,
      "history noted",
      "When was your last dental visit?"
    );
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
