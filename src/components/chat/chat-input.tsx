"use client";

import { useCallback, useRef, useState } from "react";
import { Paperclip, Mic, MicOff, Send } from "lucide-react";

interface ChatInputProps {
  onSendText: (text: string) => void;
  onAttachFile: () => void;
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
  disabled,
  dictation,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
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

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="border-t border-stone-200 bg-white px-3 py-3">
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={onAttachFile}
          disabled={disabled}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-40"
          aria-label="Attach file"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <div className="relative min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Type a message..."
            disabled={disabled}
            rows={1}
            className="w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none disabled:opacity-40"
          />
        </div>

        {dictation?.isSupported && (
          <button
            type="button"
            onClick={
              dictation.isListening
                ? dictation.stopListening
                : dictation.startListening
            }
            disabled={disabled}
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
              dictation.isListening
                ? "bg-red-100 text-red-500"
                : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            } disabled:opacity-40`}
            aria-label={dictation.isListening ? "Stop dictation" : "Start dictation"}
          >
            {dictation.isListening ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
