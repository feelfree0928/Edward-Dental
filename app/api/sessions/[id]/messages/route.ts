import { NextResponse } from "next/server";
import type { Anthropic } from "@anthropic-ai/sdk";
import {
  CLAUDE_MODEL,
  completeIntakeTool,
  formatAnthropicError,
  getAnthropicClient,
  INTAKE_SYSTEM_PROMPT,
  isAnthropicAccessDenied,
} from "@/lib/anthropic";
import {
  FALLBACK_FAREWELL,
  generateFallbackReply,
  isIntakeFallbackEnabled,
  shouldCompleteIntake,
} from "@/lib/intake-fallback";
import {
  ApiError,
  endSessionWithSummary,
  messageRowToApi,
  resolveSupabaseClient,
  toErrorResponse,
} from "../../lib";

async function saveAssistantMessage(
  supabase: ReturnType<typeof resolveSupabaseClient>,
  sessionId: string,
  content: string
) {
  const { data: aiRow, error: aiMessageErr } = await supabase
    .from("messages")
    .insert({ session_id: sessionId, role: "assistant", content })
    .select()
    .single();

  if (aiMessageErr || !aiRow) {
    throw new Error("Failed to save AI response");
  }
  return aiRow;
}

async function respondWithFallback(
  supabase: ReturnType<typeof resolveSupabaseClient>,
  sessionId: string,
  patientMessages: { content: string }[]
) {
  const patientCount = patientMessages.length;
  const lastPatient = patientMessages[patientCount - 1]?.content ?? "";

  if (shouldCompleteIntake(patientCount, lastPatient)) {
    const aiRow = await saveAssistantMessage(supabase, sessionId, FALLBACK_FAREWELL);
    await endSessionWithSummary(sessionId);
    return NextResponse.json({ ...messageRowToApi(aiRow), sessionEnded: true, fallback: true });
  }

  const reply = generateFallbackReply(patientCount, lastPatient);
  const aiRow = await saveAssistantMessage(supabase, sessionId, reply);
  return NextResponse.json({ ...messageRowToApi(aiRow), fallback: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = resolveSupabaseClient();
    const { id: sessionId } = await params;

    const { data: session, error: sessionErr } = await supabase
      .from("sessions")
      .select("id, status")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.status !== "active") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 });
    }

    const body = await req.json();
    const { content } = body as { content: string };
    if (!content?.trim()) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    const { data: patientRow, error: patientErr } = await supabase
      .from("messages")
      .insert({ session_id: sessionId, role: "patient", content: content.trim() })
      .select()
      .single();

    if (patientErr || !patientRow) {
      throw new Error("Failed to save message");
    }

    const { data: msgRows, error: messagesErr } = await supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (messagesErr) {
      throw new Error(`Failed to fetch conversation history: ${messagesErr.message}`);
    }

    const patientMessages = (msgRows ?? []).filter((m) => m.role === "patient");
    const chatMessages = (msgRows ?? []).map((m) => ({
      role: m.role === "patient" ? ("user" as const) : ("assistant" as const),
      content: m.content as string,
    }));

    const anthropic = getAnthropicClient();
    if (!anthropic) {
      if (isIntakeFallbackEnabled()) {
        return respondWithFallback(supabase, sessionId, patientMessages);
      }
      throw new ApiError(
        "Missing ANTHROPIC_API_KEY. Add it to .env or set ANTHROPIC_DEV_FALLBACK=true for local demo mode.",
        500
      );
    }

    if (isIntakeFallbackEnabled()) {
      return respondWithFallback(supabase, sessionId, patientMessages);
    }

    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        system: INTAKE_SYSTEM_PROMPT,
        tools: [completeIntakeTool],
        messages: chatMessages,
      });

      const toolUse = response.content.find(
        (b) => b.type === "tool_use" && b.name === "complete_intake"
      ) as Extract<Anthropic.ContentBlock, { type: "tool_use" }> | undefined;

      if (toolUse) {
        const input = toolUse.input as { farewell_message: string };
        const farewell = input.farewell_message;
        const aiRow = await saveAssistantMessage(supabase, sessionId, farewell);

        await endSessionWithSummary(sessionId);

        return NextResponse.json({ ...messageRowToApi(aiRow), sessionEnded: true });
      }

      const textBlock = response.content.find(
        (b) => b.type === "text"
      ) as Extract<Anthropic.ContentBlock, { type: "text" }> | undefined;
      const aiText = textBlock?.text ?? "";
      const aiRow = await saveAssistantMessage(supabase, sessionId, aiText);
      return NextResponse.json(messageRowToApi(aiRow));
    } catch (err) {
      console.error("Claude API error:", err);

      if (isAnthropicAccessDenied(err)) {
        console.warn(
          "Anthropic API returned 403; using local intake fallback. Fix ANTHROPIC_API_KEY or set ANTHROPIC_DEV_FALLBACK=true."
        );
        return respondWithFallback(supabase, sessionId, patientMessages);
      }

      const { status, message } = formatAnthropicError(err);
      throw new ApiError(message, status >= 400 && status < 600 ? status : 502);
    }
  } catch (err) {
    if (!(err instanceof ApiError)) {
      console.error("Message route error:", err);
    }
    return toErrorResponse(err, "Failed to process patient message");
  }
}
