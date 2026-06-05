"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Loader2, Bot, User, CheckCircle2, Edit2, Check, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function SessionDetailView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const { data: session, isLoading } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error("Failed to fetch session");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as { status?: string } | undefined;
      if (data?.status === "active") return 3000;
      if (data?.status === "summarizing") return 2000;
      return false;
    },
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const approveSession = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Session Approved", description: "Summary saved successfully." });
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });

  if (isLoading || !session) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (session.status === "summarizing") {
    return (
      <div className="flex-1 flex flex-col h-full bg-background">
        <div className="h-16 border-b border-border flex items-center px-6 bg-card shrink-0">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Preparing clinical summary</h2>
            <p className="text-muted-foreground mt-2 max-w-md">
              Please wait while AI finalizes the handoff notes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const summaryReady = session.status === "completed" || session.status === "approved";

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="font-semibold text-lg">{session.patientName || "Anonymous"} — Review</h2>
            <p className="text-xs text-muted-foreground">Session ID: {session.id.split('-')[0]}</p>
          </div>
        </div>
        {session.status === "completed" && (
          <Button onClick={() => approveSession.mutate()} disabled={approveSession.isPending}>
            {approveSession.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Approve & Save
          </Button>
        )}
        {session.status === "approved" && (
          <div className="flex items-center text-green-600 font-medium bg-green-50 px-3 py-1.5 rounded-full text-sm">
            <CheckCircle2 className="w-4 h-4 mr-2" /> Approved
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Transcript */}
        <div className="w-1/2 border-r border-border bg-muted/20 flex flex-col h-full">
          <div className="p-4 border-b border-border bg-card shrink-0">
            <h3 className="font-semibold text-foreground">Chat Transcript</h3>
          </div>
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              {session.messages.map((msg: { id: string; role: string; content: string }) => (
                <div key={msg.id} className="flex gap-3">
                  <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center mt-1 ${msg.role === "patient" ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}>
                    {msg.role === "patient" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={`p-4 rounded-xl ${msg.role === "patient" ? "bg-card border border-border" : "bg-primary/5 border border-primary/10"}`}>
                    <p className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Consent + Summary */}
        <div className="w-1/2 flex flex-col bg-background h-full">
          <ScrollArea className="flex-1 w-full">
            <div className="p-6 space-y-6 w-full min-w-0">
              <ConsentAuditPanel consent={session.consent} />

              <div>
                <h3 className="font-semibold text-foreground mb-1">Clinical Handoff Summary</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Click any field to edit before approving. Notes should include red flags, missing details, and front-desk prep context.
                </p>
                {summaryReady ? (
                  <div className="space-y-4">
                <SummaryField label="Chief Complaint" field="chiefComplaint" value={session.summary?.chiefComplaint} sessionId={sessionId} />
                <SummaryField label="Medical History" field="medicalHistory" value={session.summary?.medicalHistory} sessionId={sessionId} />
                <SummaryField label="Dental History" field="dentalHistory" value={session.summary?.dentalHistory} sessionId={sessionId} />
                <SummaryField label="Medications" field="medications" value={session.summary?.medications} sessionId={sessionId} />
                <SummaryField label="Allergies" field="allergies" value={session.summary?.allergies} sessionId={sessionId} />
                <SummaryField label="Detailed Notes (Flags + Prep)" field="notes" value={session.summary?.notes} sessionId={sessionId} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Summary will appear once the session is ready for review.</p>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

type ConsentQuestion = {
  index: number;
  question: string;
  answer: string | null;
  passed: boolean | null;
  retries: number;
};

type ConsentAudit = {
  consentShownAt: string;
  intakeStartedAt: string | null;
  consentAccepted: boolean;
  consentLanguage: string;
  questions: ConsentQuestion[];
};

function ConsentAuditPanel({ consent }: { consent: ConsentAudit | null }) {
  const [languageExpanded, setLanguageExpanded] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">Consent &amp; Verification</h3>
        {consent?.consentAccepted ? (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1.5 py-1">
            <CheckCircle2 className="w-3 h-3" />
            Consent Accepted
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1.5 py-1">
            Not Recorded
          </Badge>
        )}
      </div>

      {!consent ? (
        <p className="text-muted-foreground text-sm">No consent record for this session.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Card className="p-3 border-border bg-card">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Consent screen shown</p>
              <p className="text-foreground">{new Date(consent.consentShownAt).toLocaleString()}</p>
            </Card>
            <Card className="p-3 border-border bg-card">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Clinical intake began</p>
              <p className="text-foreground">
                {consent.intakeStartedAt ? new Date(consent.intakeStartedAt).toLocaleString() : "—"}
              </p>
            </Card>
          </div>

          <Card className="p-4 border-border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setLanguageExpanded((v) => !v)}
            >
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Language shown to patient
              </span>
              {languageExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
            {languageExpanded && (
              <p className="text-sm text-foreground mt-3 leading-relaxed">{consent.consentLanguage}</p>
            )}
          </Card>

          <div className="space-y-3">
            {consent.questions.map((q) => (
              <Card key={q.index} className="p-4 border-border bg-card">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Q{q.index}
                  </p>
                  {q.passed ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Pass
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1 shrink-0">
                      <XCircle className="w-3 h-3" />
                      Fail
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground mb-2">{q.question}</p>
                <div className="text-sm">
                  <span className="text-muted-foreground">Answer: </span>
                  <span className="text-foreground">{q.answer ?? "—"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Retries: {q.retries}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function renderMarkdownBold(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lineIndex) => {
    const parts: Array<string | ReactNode> = [];
    const pattern = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let matchIndex = 0;

    for (const match of line.matchAll(pattern)) {
      const start = match.index ?? 0;
      if (start > lastIndex) {
        parts.push(line.slice(lastIndex, start));
      }

      const boldText = match[1] ?? "";
      parts.push(
        <strong key={`bold-${lineIndex}-${matchIndex}`} className="font-semibold">
          {boldText}
        </strong>
      );

      lastIndex = start + match[0].length;
      matchIndex += 1;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return (
      <span key={`line-${lineIndex}`}>
        {parts.length > 0 ? parts : line}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
}

function SummaryField({ label, field, value, sessionId }: { label: string; field: string; value?: string | null; sessionId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value || "");
  const queryClient = useQueryClient();

  const handleStartEditing = () => {
    setCurrentValue(value || "");
    setIsEditing(true);
  };

  const updateSummary = useMutation({
    mutationFn: async (data: Record<string, string | null>) => {
      const res = await fetch(`/api/sessions/${sessionId}/summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update summary");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });

  const handleSave = () => {
    setIsEditing(false);
    if (currentValue !== (value || "")) {
      updateSummary.mutate({ [field]: currentValue });
    }
  };

  if (isEditing) {
    return (
      <Card className="p-4 border-primary ring-1 ring-primary/20 shadow-sm relative group">
        <label className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 block">{label}</label>
        <Textarea value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} onBlur={handleSave} autoFocus className="min-h-[100px] border-0 focus-visible:ring-0 p-0 resize-none" />
        <div className="absolute top-4 right-4 text-primary"><Check className="w-4 h-4" /></div>
      </Card>
    );
  }

  return (
    <Card className="p-4 border-border hover:border-accent hover:ring-1 hover:ring-accent/20 cursor-text transition-all group relative bg-card shadow-sm" onClick={handleStartEditing}>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block group-hover:text-accent transition-colors">{label}</label>
      <div className="text-foreground text-[15px] whitespace-pre-wrap min-h-[24px]">
        {value ? renderMarkdownBold(value) : <span className="text-muted-foreground italic">Not specified</span>}
      </div>
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-accent transition-opacity"><Edit2 className="w-4 h-4" /></div>
    </Card>
  );
}
