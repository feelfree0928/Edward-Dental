import { NextResponse } from "next/server";
import type { SessionRow } from "@/lib/supabase";
import {
  CLAUDE_MODEL,
  getAnthropicClient,
  isAnthropicAccessDenied,
  isAnthropicKnownDenied,
  markAnthropicAccessDenied,
} from "@/lib/anthropic";
import {
  buildConsentEvaluationPrompt,
  evaluateVerificationAnswer,
  parseYesNoOnly,
  type VerificationQuestionIndex,
} from "@/lib/consent-verification";
import { isIntakeFallbackEnabled } from "@/lib/intake-fallback";
import { ApiError, resolveSupabaseClient, toErrorResponse } from "../../../lib";

type VerifyPayload = {
  questionIndex: VerificationQuestionIndex;
  answer: string;
};

function isValidQuestionIndex(value: unknown): value is VerificationQuestionIndex {
  return value === 1 || value === 2 || value === 3;
}

async function evaluateWithClaude(questionIndex: VerificationQuestionIndex, answer: string): Promise<boolean> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new ApiError("Anthropic client unavailable", 503);
  }

  const prompt = buildConsentEvaluationPrompt(questionIndex, answer);

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  return parseYesNoOnly(text);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = resolveSupabaseClient();
    const { id: sessionId } = await params;

    const { data: session, error: sessionErr } = await supabase
      .from("sessions")
      .select("id, status")
      .eq("id", sessionId)
      .single<Pick<SessionRow, "id" | "status">>();

    if (sessionErr || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status !== "pending_consent") {
      return NextResponse.json(
        { error: "Consent verification is not active for this session." },
        { status: 409 }
      );
    }

    const body = (await req.json()) as VerifyPayload;

    if (!isValidQuestionIndex(body.questionIndex)) {
      throw new ApiError("questionIndex must be 1, 2, or 3", 400);
    }

    if (!body.answer?.trim()) {
      throw new ApiError("answer is required", 400);
    }

    const trimmedAnswer = body.answer.trim();
    let passed = false;
    let usedFallback = false;

    if (isIntakeFallbackEnabled() || isAnthropicKnownDenied()) {
      passed = evaluateVerificationAnswer(body.questionIndex, trimmedAnswer);
      usedFallback = true;
    } else {
      try {
        passed = await evaluateWithClaude(body.questionIndex, trimmedAnswer);
      } catch (err) {
        if (isAnthropicAccessDenied(err)) {
          markAnthropicAccessDenied("Anthropic API returned 403; consent verify using regex fallback.");
          passed = evaluateVerificationAnswer(body.questionIndex, trimmedAnswer);
          usedFallback = true;
        } else if (err instanceof ApiError && err.status === 503) {
          passed = evaluateVerificationAnswer(body.questionIndex, trimmedAnswer);
          usedFallback = true;
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({ passed, usedFallback });
  } catch (error) {
    return toErrorResponse(error, "Failed to verify consent answer");
  }
}
