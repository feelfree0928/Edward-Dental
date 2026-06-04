import { NextResponse } from "next/server";
import {
  fetchSessionDetail,
  messageRowToApi,
  resolveSupabaseClient,
  rowToSessionResponse,
  summaryRowToApi,
  toErrorResponse,
} from "../../lib";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = resolveSupabaseClient();
    const { id: sessionId } = await params;
    const body = await req.json();
    const updates = body as Record<string, string | null>;

    const upsertData: Record<string, unknown> = { session_id: sessionId };
    const fieldMap: Record<string, string> = {
      chiefComplaint: "chief_complaint",
      medicalHistory: "medical_history",
      dentalHistory: "dental_history",
      medications: "medications",
      allergies: "allergies",
      notes: "notes",
    };

    for (const [key, value] of Object.entries(updates)) {
      const col = fieldMap[key];
      if (col) upsertData[col] = value;
    }

    const { error } = await supabase
      .from("clinical_summaries")
      .upsert(upsertData, { onConflict: "session_id" });

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
    return toErrorResponse(error, "Failed to update session summary");
  }
}
