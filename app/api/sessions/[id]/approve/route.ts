import { NextResponse } from "next/server";
import {
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

    const { error } = await supabase
      .from("sessions")
      .update({ status: "approved" })
      .eq("id", sessionId);

    if (error) {
      throw new Error(error.message);
    }

    const { session, messages, summary } = await fetchSessionDetail(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...rowToSessionResponse(session, messages.length),
      messages: messages.map(messageRowToApi),
      summary: summaryRowToApi(summary),
    });
  } catch (error) {
    return toErrorResponse(error, "Failed to approve session");
  }
}
