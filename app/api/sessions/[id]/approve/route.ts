import { NextResponse } from "next/server";
import type { SessionRow } from "@/lib/supabase";
import {
  consentLogToApi,
  fetchSessionDetail,
  isSessionReviewReady,
  messageRowToApi,
  resolveSupabaseClient,
  rowToSessionResponse,
  summaryRowToApi,
  toErrorResponse,
} from "../../lib";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = resolveSupabaseClient();
    const { id: sessionId } = await params;

    const { data: existing } = await supabase
      .from("sessions")
      .select("status")
      .eq("id", sessionId)
      .single<Pick<SessionRow, "status">>();

    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (!isSessionReviewReady(existing.status)) {
      return NextResponse.json(
        { error: "Clinical summary is still being generated. Try again shortly." },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("sessions")
      .update({ status: "approved" })
      .eq("id", sessionId);

    if (error) {
      throw new Error(error.message);
    }

    const { session, messages, summary, consent } = await fetchSessionDetail(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...rowToSessionResponse(session, messages.length),
      messages: messages.map(messageRowToApi),
      summary: summaryRowToApi(summary),
      consent: consentLogToApi(consent),
    });
  } catch (error) {
    return toErrorResponse(error, "Failed to approve session");
  }
}
