"use client";

import { User, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Role = "patient" | "manager";

interface HeaderProps {
  role: Role;
  setRole: (role: Role) => void;
}

export function Header({ role, setRole }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary font-serif">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
            E
          </div>
          <span className="text-xl font-bold tracking-tight">Edward's Dental</span>
        </div>

        <div className="flex items-center bg-muted rounded-full p-1 border border-border">
          <Button
            variant={role === "patient" ? "default" : "ghost"}
            size="sm"
            className="rounded-full px-4"
            onClick={() => setRole("patient")}
          >
            <User className="w-4 h-4 mr-2" />
            Patient
          </Button>
          <Button
            variant={role === "manager" ? "default" : "ghost"}
            size="sm"
            className="rounded-full px-4"
            onClick={() => setRole("manager")}
          >
            <LayoutDashboard className="w-4 h-4 mr-2" />
            Manager
          </Button>
        </div>
      </div>
    </header>
  );
}
