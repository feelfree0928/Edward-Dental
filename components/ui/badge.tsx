import * as React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outline" | "secondary" | "destructive";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        {
          "bg-primary text-primary-foreground border-transparent": variant === "default",
          "bg-secondary text-secondary-foreground border-transparent": variant === "secondary",
          "bg-destructive text-destructive-foreground border-transparent": variant === "destructive",
        },
        variant === "outline" && "border-border bg-background text-foreground",
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";
export { Badge };
