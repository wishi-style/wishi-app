"use client";

import Image from "next/image";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClockIcon, AlertTriangleIcon, SparklesIcon, MessageCircleIcon } from "lucide-react";

export type SessionPriority = "overdue" | "due_today" | "active" | "new" | "completed";
export type StylistSessionType = "mini" | "major" | "lux";

export interface StylistSessionCardProps {
  id: string;
  clientName: string;
  clientImage?: string;
  sessionType: StylistSessionType;
  priority: SessionPriority;
  dueLabel: string;
  lastMessage: string;
  boardsDelivered: number;
  boardsTotal: number;
  onOpen?: () => void;
}

const priorityConfig: Record<SessionPriority, { label: string; icon: React.ElementType; className: string; cardAccent: string }> = {
  overdue: {
    label: "Overdue",
    icon: AlertTriangleIcon,
    className: "bg-destructive/10 text-destructive border-destructive/20",
    cardAccent: "border-l-destructive",
  },
  due_today: {
    label: "Due today",
    icon: ClockIcon,
    className: "bg-amber-50 text-amber-700 border-amber-200",
    cardAccent: "border-l-amber-500",
  },
  active: {
    label: "Active",
    icon: MessageCircleIcon,
    className: "bg-accent/10 text-accent border-accent/20",
    cardAccent: "border-l-accent",
  },
  new: {
    label: "New",
    icon: SparklesIcon,
    className: "bg-secondary text-secondary-foreground border-secondary",
    cardAccent: "border-l-foreground",
  },
  completed: {
    label: "Completed",
    icon: ClockIcon,
    className: "bg-muted text-muted-foreground border-muted",
    cardAccent: "border-l-muted-foreground",
  },
};

function getActionLabel(priority: SessionPriority): string {
  const labels: Record<SessionPriority, string> = {
    overdue: "Respond now",
    due_today: "Continue",
    active: "View session",
    new: "Start styling",
    completed: "View summary",
  };
  return labels[priority];
}

export function SessionQueueCard({
  clientName,
  clientImage,
  sessionType,
  priority,
  dueLabel,
  lastMessage,
  boardsDelivered,
  boardsTotal,
  onOpen,
}: StylistSessionCardProps) {
  const initials = clientName
    .split(" ")
    .map((n) => n[0])
    .join("");

  const config = priorityConfig[priority];
  const PriorityIcon = config.icon;
  const isUrgent = priority === "overdue" || priority === "due_today";

  return (
    <div
      className={cn(
        "group flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 rounded-sm bg-card p-4 sm:p-6 transition-all hover:shadow-md border-l-2",
        config.cardAccent
      )}
    >
      {/* Client avatar */}
      <div className="flex items-center gap-3 sm:contents">
        <Avatar className="h-12 w-12 sm:h-16 sm:w-16 shrink-0">
          {clientImage && <AvatarImage src={clientImage} alt={clientName} />}
          <AvatarFallback className="bg-secondary text-secondary-foreground font-display text-lg">
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* Mobile name row */}
        <div className="sm:hidden">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg">{clientName}</h3>
            <Badge
              variant="outline"
              className={cn(
                "rounded-sm text-[10px] tracking-widest font-body font-medium border-0",
                sessionType === "lux"
                  ? "bg-warm-beige text-dark-taupe"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {sessionType === "lux" ? "Lux" : sessionType === "major" ? "Major" : "Mini"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <PriorityIcon className="h-3 w-3" />
            <span className="text-xs font-body">{dueLabel}</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="hidden sm:flex items-center gap-3">
          <h3 className="font-display text-xl">{clientName}</h3>
          <Badge
            variant="outline"
            className={cn(
              "rounded-sm text-[10px] tracking-widest font-body font-medium border-0",
              sessionType === "lux"
                ? "bg-warm-beige text-dark-taupe"
                : "bg-secondary text-secondary-foreground"
            )}
          >
            {sessionType === "lux" ? "Lux" : sessionType === "major" ? "Major" : "Mini"}
          </Badge>
          <Badge
            variant="outline"
            className={cn("rounded-sm text-[10px] font-body font-medium", config.className)}
          >
            <PriorityIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground font-body line-clamp-2 sm:truncate sm:max-w-lg">
          {lastMessage}
        </p>

        <div className="flex items-center gap-4">
          <p className="hidden sm:block text-sm text-taupe font-body">
            {dueLabel}
          </p>
          <span className="text-xs font-body text-muted-foreground">
            Boards: {boardsDelivered}/{boardsTotal}
          </span>
        </div>
      </div>

      {/* Action */}
      <Button
        onClick={onOpen}
        variant={isUrgent ? "default" : "outline"}
        className="shrink-0 rounded-sm px-8 tracking-widest text-xs font-body w-full sm:w-auto"
      >
        {getActionLabel(priority)}
      </Button>
    </div>
  );
}
