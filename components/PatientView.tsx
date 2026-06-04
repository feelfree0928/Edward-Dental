"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, User, Bot, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";

export function PatientView() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isNamePrompt, setIsNamePrompt] = useState(true);

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
      setIsNamePrompt(false);
    },
  });

  if (isNamePrompt && !sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
          <Card className="p-8 text-center border-border shadow-lg">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
              <Bot className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Welcome to Edward's Dental</h2>
            <p className="text-muted-foreground mb-8">
              Our AI assistant is ready to help prepare for your visit. May we have your name?
            </p>
            <div className="space-y-4">
              <Input
                placeholder="Your name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-center text-lg"
                onKeyDown={(e) => { if (e.key === "Enter") createSession.mutate(name); }}
              />
              <div className="flex flex-col gap-2">
                <Button size="lg" className="w-full text-lg" onClick={() => createSession.mutate(name)} disabled={createSession.isPending}>
                  {createSession.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Start Consultation"}
                </Button>
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => createSession.mutate(undefined)} disabled={createSession.isPending}>
                  Continue Anonymously
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (sessionId) {
    return <ChatInterface sessionId={sessionId} onReset={() => { setSessionId(null); setIsNamePrompt(true); }} />;
  }

  return null;
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
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to send message"
        );
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

  const isCompleted = sessionDetail?.status === "completed" || sessionDetail?.status === "approved";

  if (isLoadingSession) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-6">
      <div className="bg-card rounded-2xl shadow-sm border border-border flex-1 flex flex-col overflow-hidden">
        {/* Chat Header */}
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

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-6 max-w-3xl mx-auto">
            {sessionDetail?.messages.length === 0 && (
              <div className="text-center text-muted-foreground mt-10">Hi! Please tell me about your dental concerns today.</div>
            )}
            <AnimatePresence initial={false}>
              {sessionDetail?.messages.map((msg: { id: string; role: string; content: string }) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === "patient" ? "justify-end" : "justify-start"}`}>
                  <div className={`flex max-w-[80%] gap-3 ${msg.role === "patient" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center mt-1 ${msg.role === "patient" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`}>
                      {msg.role === "patient" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`p-4 rounded-2xl ${msg.role === "patient" ? "bg-accent text-accent-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm border border-border"}`}>
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {sendMessage.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center mt-1"><Bot className="w-4 h-4" /></div>
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

        {/* Input Area */}
        <div className="p-4 bg-background border-t border-border">
          {isCompleted ? (
            <div className="text-center p-4 bg-muted/50 rounded-xl flex flex-col items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary mb-2" />
              <h3 className="font-semibold text-foreground">Consultation Completed</h3>
              <p className="text-sm text-muted-foreground mb-4">Your summary has been sent to the front desk.</p>
              <Button onClick={onReset} variant="outline">Start New Session</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 max-w-3xl mx-auto">
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                placeholder="Type your message..."
                className="flex-1 rounded-full px-6 py-6 text-[15px]"
                disabled={sendMessage.isPending}
              />
              <Button onClick={handleSend} disabled={!content.trim() || sendMessage.isPending} size="icon" className="h-12 w-12 rounded-full shrink-0">
                <Send className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
