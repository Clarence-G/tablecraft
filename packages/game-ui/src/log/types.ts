export type LogEntryKind = 'system' | 'action' | 'info';

export interface LogEntry {
  id: string;
  at: number;
  kind: LogEntryKind;
  actorId?: string;
  messageKey: string;
  messageParams?: Record<string, string | number>;
}

export interface PushLogEntry {
  kind: LogEntryKind;
  actorId?: string;
  messageKey: string;
  messageParams?: Record<string, string | number>;
}
