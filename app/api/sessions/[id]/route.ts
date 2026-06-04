import { NextResponse } from "next/server";
import {
  fetchSessionDetail,
  messageRowToApi,
  rowToSessionResponse,
  summaryRowToApi,
  toErrorResponse,
} from "../lib";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, messages, summary } = await fetchSessionDetail(id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...rowToSessionResponse(session, messages.length),
      messages: messages.map(messageRowToApi),
      summary: summaryRowToApi(summary),
    });
  } catch (error) {
    return toErrorResponse(error, "Failed to load session details");
  }
}
