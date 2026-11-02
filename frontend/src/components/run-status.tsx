import { Badge } from "@/components/ui/badge";
import type { Run } from "@/lib/api";

const STYLE: Record<Run["status"], string> = {
  queued: "border-slate-500 text-slate-300",
  running: "border-sky-500 text-sky-300",
  completed: "border-emerald-500 text-emerald-300",
  failed: "border-red-500 text-red-300",
};

export function RunStatusBadge({ status }: { status: Run["status"] }) {
  return (
    <Badge variant="outline" className={STYLE[status]}>
      {status}
    </Badge>
  );
}
