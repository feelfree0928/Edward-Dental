import { NextResponse } from "next/server";
import { resolveSupabaseClient, toErrorResponse } from "../lib";

export async function GET() {
  try {
    const supabase = resolveSupabaseClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase.from("sessions").select("status, started_at");

    if (error) {
      throw new Error(error.message);
    }

    const all = data ?? [];
    return NextResponse.json({
      total: all.length,
      active: all.filter((s) => s.status === "active").length,
      completed: all.filter((s) => s.status === "completed").length,
      approved: all.filter((s) => s.status === "approved").length,
      todayCount: all.filter((s) => (s.started_at as string).startsWith(today)).length,
    });
  } catch (error) {
    return toErrorResponse(error, "Failed to load session statistics");
  }
}
