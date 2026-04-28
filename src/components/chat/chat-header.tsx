"use client";

interface ChatHeaderProps {
  otherUserName: string;
  otherUserAvatar?: string | null;
  sessionStatus: string;
}

export function ChatHeader({
  otherUserName,
  otherUserAvatar,
  sessionStatus,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
        {otherUserAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={otherUserAvatar}
            alt={otherUserName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg text-muted-foreground">
            {otherUserName.charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {otherUserName}
        </p>
        <p className="text-xs capitalize text-muted-foreground">
          {sessionStatus.toLowerCase().replace(/_/g, " ")}
        </p>
      </div>
    </div>
  );
}
