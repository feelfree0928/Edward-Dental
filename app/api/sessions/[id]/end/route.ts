import { NextResponse } from "next/server";
import {
  endSessionWithSummary,
  fetchSessionDetail,
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

    const { data: session } = await supabase
      .from("sessions")
      .select("id, status")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "active") {
      await endSessionWithSummary(sessionId);
    }

    const { session: full, messages, summary } = await fetchSessionDetail(sessionId);
    if (!full) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...rowToSessionResponse(full, messages.length),
      messages: messages.map(messageRowToApi),
      summary: summaryRowToApi(summary),
    });
  } catch (error) {
    return toErrorResponse(error, "Failed to end session");
  }
}
