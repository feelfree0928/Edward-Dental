import { NextResponse } from "next/server";
import type { SessionRow } from "@/lib/supabase";
import {
  CLAUDE_MODEL,
  formatAnthropicError,
  getAnthropicClient,
} from "@/lib/anthropic";
import {
  buildConsentAgreementPrompt,
  parseConsentOutcome,
  type ConsentOutcome,
} from "@/lib/consent-verification";
import { ApiError, resolveSupabaseClient, toErrorResponse } from "../../../lib";

type VerifyPayload = {
  answer: string;
};

async function evaluateAgreementWithClaude(answer: string): Promise<ConsentOutcome> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new ApiError(
      "Missing ANTHROPIC_API_KEY. Add it to .env and restart the dev server.",
      500
    );
  }

  const prompt = buildConsentAgreementPrompt(answer);

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    return parseConsentOutcome(text);
  } catch (err) {
    console.error("Consent verify Claude API error:", err);
    const { status, message } = formatAnthropicError(err);
    throw new ApiError(message, status >= 400 && status < 600 ? status : 502);
  }
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

    if (!body.answer?.trim()) {
      throw new ApiError("answer is required", 400);
    }

    const outcome = await evaluateAgreementWithClaude(body.answer.trim());

    return NextResponse.json({ outcome });
  } catch (error) {
    return toErrorResponse(error, "Failed to verify consent answer");
  }
}
