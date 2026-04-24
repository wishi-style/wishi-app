"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  clientId: string;
  initialBody: string;
  clientName: string;
}

export function PrivateNoteEditor({ clientId, initialBody, clientName }: Props) {
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(initialBody);
  const dirty = body !== lastSaved;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/stylist/clients/${clientId}/note`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        toast.error("Couldn't save note");
        return;
      }
      setLastSaved(body);
      toast.success(body.trim() ? "Note saved" : "Note cleared");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          clientName
            ? `Private notes about ${clientName} — style preferences you've picked up, restyle patterns, things to remember next session…`
            : "Private notes about this client — only you see these."
        }
        className="min-h-[120px] font-body text-sm resize-none rounded-sm"
        maxLength={5000}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="font-body text-[11px] text-muted-foreground">
          {body.length}/5000 · only you can see this
        </span>
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="h-8 rounded-sm font-body text-xs"
        >
          {saving ? "Saving…" : "Save note"}
        </Button>
      </div>
    </div>
  );
}
