import { NextResponse } from "next/server";
import type { SessionRow } from "@/lib/supabase";
import {
  isMissingRelationError,
  resolveSupabaseClient,
  rowToSessionResponse,
  toErrorResponse,
} from "./lib";

export async function GET() {
  try {
    const supabase = resolveSupabaseClient();
    const listResult = await supabase
      .from("sessions_list")
      .select("*")
      .order("started_at", { ascending: false });

    if (listResult.error && isMissingRelationError(listResult.error, "sessions_list")) {
      const [sessionsResult, messagesResult] = await Promise.all([
        supabase.from("sessions").select("*").order("started_at", { ascending: false }),
        supabase.from("messages").select("session_id"),
      ]);

      if (sessionsResult.error) {
        throw new Error(`Failed to fetch sessions: ${sessionsResult.error.message}`);
      }
      if (messagesResult.error) {
        throw new Error(`Failed to count messages: ${messagesResult.error.message}`);
      }

      const messageCounts = new Map<string, number>();
      for (const row of messagesResult.data ?? []) {
        const sessionId = String(row.session_id ?? "");
        if (!sessionId) continue;
        messageCounts.set(sessionId, (messageCounts.get(sessionId) ?? 0) + 1);
      }

      const rows = (sessionsResult.data ?? []).map((row) =>
        rowToSessionResponse(
          row as unknown as Parameters<typeof rowToSessionResponse>[0],
          messageCounts.get(String((row as SessionRow).id)) ?? 0
        )
      );

      return NextResponse.json(rows);
    }

    if (listResult.error) {
      throw new Error(listResult.error.message);
    }

    const rows = (listResult.data ?? []).map((row: Record<string, unknown>) =>
      rowToSessionResponse(
        row as unknown as Parameters<typeof rowToSessionResponse>[0],
        Number(row.message_count ?? 0)
      )
    );
    return NextResponse.json(rows);
  } catch (error) {
    return toErrorResponse(error, "Failed to load sessions");
  }
}

export async function POST(req: Request) {
  try {
    const supabase = resolveSupabaseClient();
    const body = await req.json();
    const { patientName } = body as { patientName?: string };

    const { data, error } = await supabase
      .from("sessions")
      .insert({ patient_name: patientName || null, status: "active" })
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create session");
    }

    return NextResponse.json(rowToSessionResponse(data, 0), { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Failed to create session");
  }
}
