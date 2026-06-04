"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { PatientView } from "@/components/PatientView";
import { ManagerView } from "@/components/ManagerView";
import { Toaster } from "@/components/ui/toaster";

export default function Home() {
  const [role, setRole] = useState<"patient" | "manager">("patient");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <Header role={role} setRole={setRole} />
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {role === "patient" ? <PatientView /> : <ManagerView />}
      </main>
      <Toaster />
    </div>
  );
}
