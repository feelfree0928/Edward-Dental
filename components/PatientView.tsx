"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, User, Bot, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  CONSENT_AGREEMENT_RETRY,
  CONSENT_CLARIFICATION_MESSAGE,
  CONSENT_DECLINE_MESSAGE,
  CONSENT_INTRO_TEXT,
  CONSENT_OPT_IN_QUESTION,
  CONSENT_REVIEW_TEXT,
  INTAKE_WELCOME_MESSAGE,
  type ConsentOutcome,
} from "@/lib/consent-verification";

type Phase = "name" | "consentIntro" | "consentReview" | "verify" | "intake";

type VerifyMessage = {
  id: string;
  role: "patient" | "assistant";
  content: string;
};

function createMessage(role: VerifyMessage["role"], content: string): VerifyMessage {
  return { id: `${role}-${Date.now()}-${Math.random()}`, role, content };
}

export function PatientView() {
  const [phase, setPhase] = useState<Phase>("name");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [consentShownAt, setConsentShownAt] = useState<string | null>(null);

  const createSession = useMutation({
    mutationFn: async (patientName?: string) => {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientName: patientName || null }),
      });
      if (!res.ok) throw new Error("Failed to create session");
      return res.json();
    },
    onSuccess: (session) => {
      setSessionId(session.id);
      setPhase("consentIntro");
    },
  });

  const handleReset = () => {
    setSessionId(null);
    setName("");
    setConsentShownAt(null);
    setPhase("name");
  };

  if (phase === "name" && !sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
          <Card className="p-8 text-center border-border shadow-lg">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
              <Bot className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Welcome to Edward&apos;s Dental</h2>
            <p className="text-muted-foreground mb-8">
              Our AI assistant is ready to help prepare for your visit. May we have your name?
            </p>
            <div className="space-y-4">
              <Input
                placeholder="Your name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-center text-lg"
                onKeyDown={(e) => {
                  if (e.key === "Enter") createSession.mutate(name);
                }}
              />
              <div className="flex flex-col gap-2">
                <Button
                  size="lg"
                  className="w-full text-lg"
                  onClick={() => createSession.mutate(name)}
                  disabled={createSession.isPending}
                >
                  {createSession.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Start Consultation"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => createSession.mutate(undefined)}
                  disabled={createSession.isPending}
                >
                  Continue Anonymously
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (phase === "consentIntro" && sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg w-full">
          <Card className="p-8 border-border shadow-lg">
            <h2 className="text-xl font-serif font-bold text-foreground mb-4">AI-assisted intake</h2>
            <p className="text-muted-foreground text-[15px] leading-relaxed mb-8">{CONSENT_INTRO_TEXT}</p>
            <Button size="lg" className="w-full" onClick={() => setPhase("consentReview")}>
              Continue
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (phase === "consentReview" && sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg w-full">
          <Card className="p-8 border-border shadow-lg">
            <h2 className="text-xl font-serif font-bold text-foreground mb-4">Before we begin</h2>
            <p className="text-muted-foreground text-[15px] leading-relaxed mb-8">{CONSENT_REVIEW_TEXT}</p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setConsentShownAt(new Date().toISOString());
                setPhase("verify");
              }}
            >
              Continue
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (phase === "verify" && sessionId && consentShownAt) {
    return (
      <VerificationInterface
        sessionId={sessionId}
        consentShownAt={consentShownAt}
        onComplete={() => setPhase("intake")}
        onReset={handleReset}
      />
    );
  }

  if (phase === "intake" && sessionId) {
    return <ChatInterface sessionId={sessionId} onReset={handleReset} />;
  }

  return null;
}

function VerificationInterface({
  sessionId,
  consentShownAt,
  onComplete,
  onReset,
}: {
  sessionId: string;
  consentShownAt: string;
  onComplete: () => void;
  onReset: () => void;
}) {
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState<VerifyMessage[]>(() => [
    createMessage("assistant", CONSENT_OPT_IN_QUESTION),
  ]);
  const [vagueRetries, setVagueRetries] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const recordDecline = async (answer: string, retries: number) => {
    const res = await fetch(`/api/sessions/${sessionId}/consent/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentShownAt, answer, retries }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Failed to record consent decline");
    }
  };

  const handleDecline = async (answer: string, retries: number) => {
    setIsVerifying(false);
    setIsSubmitting(false);
    setMessages((prev) => [...prev, createMessage("assistant", CONSENT_DECLINE_MESSAGE)]);
    setDeclined(true);
    try {
      await recordDecline(answer, retries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record consent decline");
      setDeclined(false);
    }
  };

  const handleAnswer = async () => {
    if (!content.trim() || isSubmitting || isVerifying || declined) return;

    const answer = content.trim();
    setContent("");
    setMessages((prev) => [...prev, createMessage("patient", answer)]);
    setIsVerifying(true);
    setError(null);

    try {
      const verifyRes = await fetch(`/api/sessions/${sessionId}/consent/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });

      const verifyData = (await verifyRes.json().catch(() => ({}))) as {
        outcome?: ConsentOutcome;
        error?: string;
      };

      if (!verifyRes.ok) {
        throw new Error(
          typeof verifyData.error === "string" ? verifyData.error : "Failed to verify answer"
        );
      }

      const outcome = verifyData.outcome;

      if (outcome === "no") {
        await handleDecline(answer, vagueRetries);
        return;
      }

      if (outcome === "question") {
        setMessages((prev) => [...prev, createMessage("assistant", CONSENT_CLARIFICATION_MESSAGE)]);
        return;
      }

      if (outcome === "unclear") {
        if (vagueRetries === 0) {
          setVagueRetries(1);
          setMessages((prev) => [...prev, createMessage("assistant", CONSENT_AGREEMENT_RETRY)]);
          return;
        }
        await handleDecline(answer, vagueRetries);
        return;
      }

      if (outcome !== "yes") {
        await handleDecline(answer, vagueRetries);
        return;
      }

      const intakeStartedAt = new Date().toISOString();
      setMessages((prev) => [...prev, createMessage("assistant", INTAKE_WELCOME_MESSAGE)]);
      setIsSubmitting(true);

      const res = await fetch(`/api/sessions/${sessionId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentShownAt,
          intakeStartedAt,
          answer,
          passed: true,
          retries: vagueRetries,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to record consent");
      }

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify answer");
      setIsSubmitting(false);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-6">
      <div className="bg-card rounded-2xl shadow-sm border border-border flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Dr. AI Assistant</h3>
              <p className="text-xs text-muted-foreground">AI intake opt-in</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onReset}>
            Cancel
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-6 max-w-3xl mx-auto">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "patient" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex max-w-[80%] gap-3 ${msg.role === "patient" ? "flex-row-reverse" : "flex-row"}`}>
                    <div
                      className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center mt-1 ${
                        msg.role === "patient"
                          ? "bg-accent text-accent-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {msg.role === "patient" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div
                      className={`p-4 rounded-2xl ${
                        msg.role === "patient"
                          ? "bg-accent text-accent-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm border border-border"
                      }`}
                    >
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {(isVerifying || isSubmitting) && !declined && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="p-4 rounded-2xl bg-muted border border-border rounded-tl-sm flex items-center gap-1">
                    <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 bg-background border-t border-border">
          {error ? (
            <p className="text-sm text-destructive text-center mb-3">{error}</p>
          ) : null}
          {declined ? (
            <div className="text-center p-4 bg-muted/50 rounded-xl flex flex-col items-center justify-center max-w-3xl mx-auto">
              <Button onClick={onReset} variant="outline">
                Start New Session
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 max-w-3xl mx-auto">
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAnswer();
                }}
                placeholder="Type your answer..."
                className="flex-1 rounded-full px-6 py-6 text-[15px]"
                disabled={isSubmitting || isVerifying}
              />
              <Button
                onClick={() => void handleAnswer()}
                disabled={!content.trim() || isSubmitting || isVerifying}
                size="icon"
                className="h-12 w-12 rounded-full shrink-0"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatInterface({ sessionId, onReset }: { sessionId: string; onReset: () => void }) {
  const [content, setContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: sessionDetail, isLoading: isLoadingSession } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error("Failed to fetch session");
      return res.json();
    },
    refetchInterval: 2000,
  });

  const sendMessage = useMutation({
    mutationFn: async (msgContent: string) => {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msgContent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to send message");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });

  const endSession = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to end session");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    },
  });

  const handleSend = () => {
    if (!content.trim() || sendMessage.isPending) return;
    const msgContent = content.trim();
    setContent("");
    sendMessage.mutate(msgContent);
  };

  const handleEnd = () => endSession.mutate();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sessionDetail?.messages]);

  const isCompleted =
    sessionDetail?.status === "completed" ||
    sessionDetail?.status === "approved" ||
    sessionDetail?.status === "summarizing";

  if (isLoadingSession) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-6">
      <div className="bg-card rounded-2xl shadow-sm border border-border flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Dr. AI Assistant</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" /> Online
              </p>
            </div>
          </div>
          {!isCompleted && (
            <Button variant="outline" size="sm" onClick={handleEnd} disabled={endSession.isPending}>
              {endSession.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              End Consultation
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-6 max-w-3xl mx-auto">
            {sessionDetail?.messages.length === 0 && (
              <div className="text-center text-muted-foreground mt-10">{INTAKE_WELCOME_MESSAGE}</div>
            )}
            <AnimatePresence initial={false}>
              {sessionDetail?.messages.map((msg: { id: string; role: string; content: string }) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "patient" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex max-w-[80%] gap-3 ${msg.role === "patient" ? "flex-row-reverse" : "flex-row"}`}>
                    <div
                      className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center mt-1 ${
                        msg.role === "patient"
                          ? "bg-accent text-accent-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {msg.role === "patient" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div
                      className={`p-4 rounded-2xl ${
                        msg.role === "patient"
                          ? "bg-accent text-accent-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm border border-border"
                      }`}
                    >
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {sendMessage.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="p-4 rounded-2xl bg-muted border border-border rounded-tl-sm flex items-center gap-1">
                    <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 bg-background border-t border-border">
          {isCompleted ? (
            <div className="text-center p-4 bg-muted/50 rounded-xl flex flex-col items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary mb-2" />
              <h3 className="font-semibold text-foreground">Consultation Completed</h3>
              <p className="text-sm text-muted-foreground mb-4">Your summary has been sent to the front desk.</p>
              <Button onClick={onReset} variant="outline">
                Start New Session
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 max-w-3xl mx-auto">
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                placeholder="Type your message..."
                className="flex-1 rounded-full px-6 py-6 text-[15px]"
                disabled={sendMessage.isPending}
              />
              <Button
                onClick={handleSend}
                disabled={!content.trim() || sendMessage.isPending}
                size="icon"
                className="h-12 w-12 rounded-full shrink-0"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
