/** 并发响应阶段的数据结构 */
export interface PendingPhase<TResponse> {
  expectedPlayers: string[];
  responses: Record<string, TResponse>;
  timerName: string;
}

export function createPendingPhase<T>(
  expectedPlayers: string[],
  timerName: string,
): PendingPhase<T> {
  return {
    expectedPlayers,
    responses: {},
    timerName,
  };
}

export function collectResponse<T>(
  pending: PendingPhase<T>,
  playerID: string,
  response: T,
): { pending: PendingPhase<T>; allDone: boolean } {
  if (!pending.expectedPlayers.includes(playerID)) {
    return { pending, allDone: false };
  }
  if (pending.responses[playerID] !== undefined) {
    return { pending, allDone: false };
  }
  const newResponses = { ...pending.responses, [playerID]: response };
  const updated: PendingPhase<T> = { ...pending, responses: newResponses };
  const allDone = Object.keys(newResponses).length === pending.expectedPlayers.length;
  return { pending: updated, allDone };
}

export function fillDefaults<T>(pending: PendingPhase<T>, defaultResponse: T): Record<string, T> {
  const filled = { ...pending.responses };
  for (const pid of pending.expectedPlayers) {
    if (filled[pid] === undefined) {
      filled[pid] = defaultResponse;
    }
  }
  return filled;
}
