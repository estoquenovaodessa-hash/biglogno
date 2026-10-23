import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  default: "",
  critical: "border-l-4 border-l-critical",
  warning: "border-l-4 border-l-warning",
  reverse: "border-l-4 border-l-reverse",
  neutral: "border-l-4 border-l-neutral",
  success: "border-l-4 border-l-success",
  info: "border-l-4 border-l-info",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof tones;
}) {
  return (
    <Card className={cn("p-4", tones[tone])}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
