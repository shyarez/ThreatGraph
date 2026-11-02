"use client";

import { useState } from "react";
import { Loader2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

export function NoteBox({ runId, targetType, targetId, onSaved }: {
  runId: string;
  targetType: "run" | "community" | "node";
  targetId?: string | null;
  onSaved?: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.addNote(runId, { target_type: targetType, target_id: targetId ?? null, text: text.trim() });
      setText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Add an investigation note for this ${targetType}…`}
        className="min-h-16 text-sm"
      />
      <Button size="sm" variant="outline" onClick={save} disabled={saving || !text.trim()} className="self-end">
        {saving ? <Loader2 className="animate-spin" /> : <StickyNote />} {saved ? "Saved" : "Save note"}
      </Button>
    </div>
  );
}
