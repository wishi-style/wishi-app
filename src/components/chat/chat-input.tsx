"use client";

import { useCallback, useRef, useState } from "react";
import {
  PaperclipIcon,
  MicIcon,
  MicOffIcon,
  SendIcon,
  PlusIcon,
  SparklesIcon,
  CameraIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";

interface ChatInputProps {
  onSendText: (text: string) => void;
  onAttachFile: () => void;
  onCameraCapture?: () => void;
  onInspirationLibrary?: () => void;
  /** Used in the placeholder ("Message {firstName}"). Falls back to "Type a message…" */
  recipientFirstName?: string | null;
  disabled?: boolean;
  dictation?: {
    isListening: boolean;
    isSupported: boolean;
    startListening: () => void;
    stopListening: () => void;
  };
}

export function ChatInput({
  onSendText,
  onAttachFile,
  onCameraCapture,
  onInspirationLibrary,
  recipientFirstName,
  disabled,
  dictation,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText("");
  }, [text, onSendText]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const placeholder = recipientFirstName
    ? `Message ${recipientFirstName}`
    : "Type a message…";

  return (
    <div className="border-t border-border px-4 md:px-8 py-3 md:py-5">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 shadow-sm focus-within:ring-1 focus-within:ring-ring transition-shadow">
          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <PopoverTrigger
              disabled={disabled}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              aria-label="Attach"
              title="Attach"
            >
              <PlusIcon className="h-5 w-5" />
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-52 p-1.5 rounded-lg"
            >
              <button
                type="button"
                onClick={() => {
                  onAttachFile();
                  setAttachOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
              >
                <PaperclipIcon className="h-4 w-4 text-muted-foreground" />
                Add a file
              </button>
              {onInspirationLibrary && (
                <button
                  type="button"
                  onClick={() => {
                    onInspirationLibrary();
                    setAttachOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <SparklesIcon className="h-4 w-4 text-muted-foreground" />
                  Inspiration library
                </button>
              )}
              {isMobile && onCameraCapture && (
                <button
                  type="button"
                  onClick={() => {
                    onCameraCapture();
                    setAttachOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <CameraIcon className="h-4 w-4 text-muted-foreground" />
                  Open camera
                </button>
              )}
            </PopoverContent>
          </Popover>

          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-40"
          />

          {dictation?.isSupported && (
            <button
              type="button"
              onClick={
                dictation.isListening
                  ? dictation.stopListening
                  : dictation.startListening
              }
              disabled={disabled}
              className={`shrink-0 transition-colors ${
                dictation.isListening
                  ? "text-destructive"
                  : "text-muted-foreground hover:text-foreground"
              } disabled:opacity-40`}
              aria-label={dictation.isListening ? "Stop dictation" : "Voice message"}
              title="Voice message"
            >
              {dictation.isListening ? (
                <MicOffIcon className="h-5 w-5" />
              ) : (
                <MicIcon className="h-5 w-5" />
              )}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label="Send message"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
