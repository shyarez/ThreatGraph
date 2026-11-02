"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, FileJson, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/common";
import { api, type Note, type Results } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { NoteBox } from "./note-box";

export function ReportTab({ runId }: { runId: string; results: Results }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [version, setVersion] = useState(0);
  const loadNotes = useCallback(() => {
    api.notes(runId).then(setNotes);
    setVersion((v) => v + 1);
  }, [runId]);
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  async function remove(id: string) {
    await api.deleteNote(id);
    loadNotes();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Investigation report</CardTitle>
            <CardDescription>Generated from this run&apos;s computed results and your notes. Print the HTML version to save as PDF.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={api.reportUrl(runId, "html")} target="_blank" rel="noreferrer"><ExternalLink /> Open HTML</a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={api.reportUrl(runId, "md")} download><Download /> Markdown</a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={api.reportUrl(runId, "json")} target="_blank" rel="noreferrer"><FileJson /> JSON</a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <iframe key={version} src={api.reportUrl(runId, "html")} className="h-[720px] w-full rounded-md border bg-white" title="Report preview" />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Add run note</CardTitle></CardHeader>
          <CardContent><NoteBox runId={runId} targetType="run" onSaved={loadNotes} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Notes ({notes.length})</CardTitle><CardDescription>Included in exported reports.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {notes.length === 0 && <Empty>No notes yet. Add them here, or from graph nodes and communities.</Empty>}
            {notes.map((n) => (
              <div key={n.id} className="rounded-md border p-2.5 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-[10px]">{n.target_type}{n.target_id ? ` ${n.target_id}` : ""}</Badge>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {fmtDate(n.created_at)}
                    <Button size="icon" variant="ghost" className="size-6" onClick={() => remove(n.id)}><Trash2 className="size-3" /></Button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap">{n.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
