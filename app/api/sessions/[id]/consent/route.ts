import { NextResponse } from "next/server";
import { INTAKE_WELCOME_MESSAGE } from "@/lib/consent-verification";
import type { SessionRow } from "@/lib/supabase";
import {
  ApiError,
  resolveSupabaseClient,
  rowToSessionResponse,
  toErrorResponse,
} from "../../lib";

type ConsentPayload = {
  consentShownAt: string;
  intakeStartedAt: string;
  q1Answer: string;
  q1Passed: boolean;
  q1Retries: number;
  q2Answer: string;
  q2Passed: boolean;
  q2Retries: number;
  q3Answer: string;
  q3Passed: boolean;
  q3Retries: number;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = resolveSupabaseClient();
    const { id: sessionId } = await params;

    const { data: session, error: sessionErr } = await supabase
      .from("sessions")
      .select("id, status, patient_name, started_at, ended_at")
      .eq("id", sessionId)
      .single<SessionRow>();

    if (sessionErr || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status !== "pending_consent") {
      return NextResponse.json(
        { error: "Consent has already been recorded for this session." },
        { status: 409 }
      );
    }

    const body = (await req.json()) as ConsentPayload;

    if (!body.consentShownAt || !body.intakeStartedAt) {
      throw new ApiError("consentShownAt and intakeStartedAt are required", 400);
    }

    if (!body.q1Passed || !body.q2Passed || !body.q3Passed) {
      throw new ApiError("All verification questions must pass before starting intake", 400);
    }

    const { error: logError } = await supabase.from("consent_logs").upsert({
      session_id: sessionId,
      consent_shown_at: body.consentShownAt,
      q1_answer: body.q1Answer,
      q1_passed: body.q1Passed,
      q1_retries: body.q1Retries,
      q2_answer: body.q2Answer,
      q2_passed: body.q2Passed,
      q2_retries: body.q2Retries,
      q3_answer: body.q3Answer,
      q3_passed: body.q3Passed,
      q3_retries: body.q3Retries,
      intake_started_at: body.intakeStartedAt,
    });

    if (logError) {
      throw new Error(logError.message);
    }

    const { data: updated, error: updateError } = await supabase
      .from("sessions")
      .update({ status: "active" })
      .eq("id", sessionId)
      .select()
      .single<SessionRow>();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Failed to activate session");
    }

    const { error: welcomeErr } = await supabase.from("messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: INTAKE_WELCOME_MESSAGE,
    });

    if (welcomeErr) {
      throw new Error(welcomeErr.message);
    }

    return NextResponse.json(rowToSessionResponse(updated, 1));
  } catch (error) {
    return toErrorResponse(error, "Failed to record consent");
  }
}
