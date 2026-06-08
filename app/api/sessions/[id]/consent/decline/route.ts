import { NextResponse } from "next/server";
import type { SessionRow } from "@/lib/supabase";
import {
  ApiError,
  resolveSupabaseClient,
  rowToSessionResponse,
  toErrorResponse,
} from "../../../lib";

type DeclinePayload = {
  consentShownAt: string;
  answer: string;
  retries: number;
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
        { error: "Consent is not pending for this session." },
        { status: 409 }
      );
    }

    const body = (await req.json()) as DeclinePayload;

    if (!body.consentShownAt) {
      throw new ApiError("consentShownAt is required", 400);
    }

    if (!body.answer?.trim()) {
      throw new ApiError("answer is required", 400);
    }

    const { error: logError } = await supabase.from("consent_logs").upsert({
      session_id: sessionId,
      consent_shown_at: body.consentShownAt,
      q1_answer: body.answer.trim(),
      q1_passed: false,
      q1_retries: body.retries ?? 0,
      intake_started_at: null,
    });

    if (logError) {
      throw new Error(logError.message);
    }

    const endedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("sessions")
      .update({ status: "completed", ended_at: endedAt })
      .eq("id", sessionId)
      .select()
      .single<SessionRow>();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Failed to complete session");
    }

    return NextResponse.json(rowToSessionResponse(updated, 0));
  } catch (error) {
    return toErrorResponse(error, "Failed to record consent decline");
  }
}
