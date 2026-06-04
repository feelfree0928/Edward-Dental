"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Activity, CheckCircle, ScrollText, ChevronRight, Loader2 } from "lucide-react";
import { SessionDetailView } from "./SessionDetail";

export function ManagerView() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["sessionStats"],
    queryFn: async () => {
      const res = await fetch("/api/sessions/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 4000,
  });

  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
    refetchInterval: 4000,
  });

  if (selectedSessionId) {
    return <SessionDetailView sessionId={selectedSessionId} onBack={() => setSelectedSessionId(null)} />;
  }

  return (
    <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Manager Dashboard</h1>
        <p className="text-muted-foreground">Monitor live patient intakes and review summaries.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Users className="w-6 h-6" /></div>
          <div><p className="text-sm font-medium text-muted-foreground">Today's Total</p><p className="text-2xl font-bold">{stats?.todayCount || 0}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500"><Activity className="w-6 h-6" /></div>
          <div><p className="text-sm font-medium text-muted-foreground">Active Now</p><p className="text-2xl font-bold">{stats?.active || 0}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent"><ScrollText className="w-6 h-6" /></div>
          <div><p className="text-sm font-medium text-muted-foreground">Needs Review</p><p className="text-2xl font-bold">{stats?.completed || 0}</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500"><CheckCircle className="w-6 h-6" /></div>
          <div><p className="text-sm font-medium text-muted-foreground">Approved</p><p className="text-2xl font-bold">{stats?.approved || 0}</p></div>
        </Card>
      </div>

      {/* Sessions List */}
      <Card className="overflow-hidden border-border">
        <div className="divide-y divide-border">
          {sessions?.length === 0 && <div className="p-8 text-center text-muted-foreground">No sessions available yet.</div>}
          {sessions?.map((session: { id: string; patientName: string | null; status: string; startedAt: string; messageCount: number }) => {
            const canOpenDetail = session.status === "completed" || session.status === "approved";
            return (
              <div
                key={session.id}
                className={`p-4 flex items-center justify-between transition-colors ${
                  canOpenDetail ? "hover:bg-muted/50 cursor-pointer" : "opacity-70 cursor-not-allowed"
                }`}
                onClick={() => {
                  if (canOpenDetail) setSelectedSessionId(session.id);
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-secondary-foreground">
                    {session.patientName ? session.patientName[0].toUpperCase() : "?"}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{session.patientName || "Anonymous Patient"}</h3>
                    <div className="flex gap-3 text-sm text-muted-foreground mt-1">
                      <span>Started: {new Date(session.startedAt).toLocaleTimeString()}</span>
                      <span>•</span>
                      <span>{session.messageCount} messages</span>
                    </div>
                    {session.status === "summarizing" && (
                      <p className="text-xs text-muted-foreground mt-1">AI summary in progress…</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <SessionStatusBadge status={session.status} />
                  {canOpenDetail && <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />Active
      </Badge>
    );
  }
  if (status === "summarizing") {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1.5 py-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Generating Summary
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 gap-1.5 py-1">
        <ScrollText className="w-3 h-3" />Review Needed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1.5 py-1">
      <CheckCircle className="w-3 h-3" />Approved
    </Badge>
  );
}
