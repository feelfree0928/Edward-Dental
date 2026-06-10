import { NextResponse } from "next/server";
import type { Anthropic } from "@anthropic-ai/sdk";
import {
  CLAUDE_MODEL,
  completeIntakeTool,
  buildIntakeSystemPrompt,
  enforceMaxWords,
  formatAnthropicError,
  getAnthropicClient,
  getIntakeReplyWordLimit,
  INTAKE_DEFAULT_FAREWELL,
  INTAKE_FAREWELL_MAX_WORDS,
  INTAKE_REPEAT_HINT,
  isRepeatedPatientMessage,
} from "@/lib/anthropic";
import {
  handleConsentAnswer,
  handleNameCapture,
  isAwaitingConsentAnswer,
} from "@/lib/patient-chat";
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

    if (session.status !== "active" && session.status !== "pending_consent") {
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
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (messagesErr) {
      throw new Error(`Failed to fetch conversation history: ${messagesErr.message}`);
    }

    const allMessages = msgRows ?? [];
    const patientMessages = allMessages.filter((m) => m.role === "patient");

    if (session.status === "pending_consent") {
      if (patientMessages.length === 1) {
        const assistantRows = await handleNameCapture(supabase, sessionId, content.trim());
        const lastRow = assistantRows[assistantRows.length - 1];
        return NextResponse.json(messageRowToApi(lastRow));
      }

      if (isAwaitingConsentAnswer(allMessages)) {
        const result = await handleConsentAnswer(supabase, sessionId, content.trim(), allMessages);
        const lastRow = result.assistantRows[result.assistantRows.length - 1];
        return NextResponse.json({
          ...messageRowToApi(lastRow),
          sessionEnded: result.sessionEnded,
          sessionActivated: result.sessionActivated,
        });
      }

      throw new ApiError("Unexpected consent phase for this session.", 400);
    }

    const chatMessages = allMessages.map((m) => ({
      role: m.role === "patient" ? ("user" as const) : ("assistant" as const),
      content: m.content as string,
    }));

    const anthropic = getAnthropicClient();
    if (!anthropic) {
      throw new ApiError(
        "Missing ANTHROPIC_API_KEY. Add it to .env and restart the dev server.",
        500
      );
    }

    try {
      const systemPrompt = buildIntakeSystemPrompt(
        isRepeatedPatientMessage(allMessages) ? INTAKE_REPEAT_HINT : undefined
      );

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 120,
        system: systemPrompt,
        tools: [completeIntakeTool],
        messages: chatMessages,
      });

      const toolUse = response.content.find(
        (b) => b.type === "tool_use" && b.name === "complete_intake"
      ) as Extract<Anthropic.ContentBlock, { type: "tool_use" }> | undefined;

      if (toolUse) {
        const input = toolUse.input as { farewell_message?: string };
        const rawFarewell =
          typeof input.farewell_message === "string" ? input.farewell_message : "";
        const farewell =
          enforceMaxWords(rawFarewell, INTAKE_FAREWELL_MAX_WORDS) || INTAKE_DEFAULT_FAREWELL;
        const aiRow = await saveAssistantMessage(supabase, sessionId, farewell);

        await endSessionWithSummary(sessionId);

        return NextResponse.json({ ...messageRowToApi(aiRow), sessionEnded: true });
      }

      const textBlock = response.content.find(
        (b) => b.type === "text"
      ) as Extract<Anthropic.ContentBlock, { type: "text" }> | undefined;
      let aiText = textBlock?.text?.trim() ?? "";
      const wordLimit = getIntakeReplyWordLimit(aiText);
      const wordCount = aiText.split(/\s+/).filter(Boolean).length;
      if (wordCount > wordLimit) {
        console.warn(
          `Intake reply exceeded ${wordLimit} words (${wordCount}); truncating for session ${sessionId}.`
        );
        aiText = enforceMaxWords(aiText, wordLimit);
      }
      const aiRow = await saveAssistantMessage(supabase, sessionId, aiText);
      return NextResponse.json(messageRowToApi(aiRow));
    } catch (err) {
      console.error("Claude API error:", err);

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
