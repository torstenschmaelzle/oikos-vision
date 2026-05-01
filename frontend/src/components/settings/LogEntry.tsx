import { Badge } from "@/components/ui/badge";
import {
  parseLogMessage,
  methodColor,
  statusColor,
  levelColor,
  type ParsedRequestLog,
} from "@/lib/log-parser";
import { Clock, Globe, ArrowRight } from "lucide-react";

interface LogLine {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
}

interface Props {
  line: LogLine;
}

function RequestEntry({ parsed, line }: { parsed: ParsedRequestLog; line: LogLine }) {
  return (
    <div className="group flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/40 transition-colors">
      {/* Primary row: method + path + status + duration */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <Badge
          variant="outline"
          className={`font-mono text-[11px] font-bold tracking-wider border px-2 py-0.5 shrink-0 ${methodColor(parsed.method)}`}
        >
          {parsed.method}
        </Badge>

        <span className="font-mono text-sm font-medium text-foreground truncate">
          {parsed.path}
        </span>

        <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />

        {parsed.status !== null && (
          <span className={`font-mono text-sm font-semibold tabular-nums ${statusColor(parsed.status)}`}>
            {parsed.status}
          </span>
        )}

        {parsed.duration && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono tabular-nums">
            <Clock className="w-3 h-3" />
            {parsed.duration}
          </span>
        )}

        <Badge
          variant="outline"
          className={`ml-auto text-[10px] h-5 font-semibold uppercase tracking-wider border shrink-0 ${levelColor(line.level)}`}
        >
          {line.level}
        </Badge>
      </div>

      {/* Secondary row: metadata */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono pl-0.5">
        <span className="tabular-nums">{line.timestamp}</span>
        <span className="text-muted-foreground/60">·</span>
        <span>{line.logger}</span>
        {parsed.ip && (
          <>
            <span className="text-muted-foreground/60">·</span>
            <span className="flex items-center gap-1">
              <Globe className="w-2.5 h-2.5" />
              {parsed.ip}
            </span>
          </>
        )}
        {parsed.forwarded && (
          <>
            <span className="text-muted-foreground/60">·</span>
            <span>fwd {parsed.forwarded}</span>
          </>
        )}
        {parsed.extra && (
          <>
            <span className="text-muted-foreground/60">·</span>
            <span className="truncate max-w-[300px]">{parsed.extra}</span>
          </>
        )}
      </div>
    </div>
  );
}

function GenericEntry({ text, line }: { text: string; line: LogLine }) {
  return (
    <div className="group flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/40 transition-colors">
      {/* Primary row: level + message */}
      <div className="flex items-start gap-2.5">
        <Badge
          variant="outline"
          className={`text-[10px] h-5 font-semibold uppercase tracking-wider border shrink-0 mt-0.5 ${levelColor(line.level)}`}
        >
          {line.level}
        </Badge>

        <span className="text-sm text-foreground leading-relaxed break-words">
          {text}
        </span>
      </div>

      {/* Secondary row: metadata */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono pl-0.5">
        <span className="tabular-nums">{line.timestamp}</span>
        <span className="text-muted-foreground/60">·</span>
        <span>{line.logger}</span>
      </div>
    </div>
  );
}

export default function LogEntry({ line }: Props) {
  const parsed = parseLogMessage(line.message);

  if (parsed.kind === "request") {
    return <RequestEntry parsed={parsed} line={line} />;
  }

  return <GenericEntry text={parsed.text} line={line} />;
}
