import { useEffect, useRef, useCallback } from "react";
import { getWsUrl } from "@/api/scans";

interface ProgressMessage {
  type: "progress";
  step: string;
  progress: number;
  message: string;
}

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 10000;

export function useWebSocket(
  jobId: string | null,
  onProgress: (msg: ProgressMessage) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval>>();
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = undefined;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = undefined;
    }
  }, []);

  const connect = useCallback(
    (currentJobId: string) => {
      const ws = new WebSocket(getWsUrl(currentJobId));
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;

        heartbeatTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, HEARTBEAT_INTERVAL_MS);

        resetHeartbeatTimeout();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "pong") {
            resetHeartbeatTimeout();
            return;
          }
          if (msg.type === "progress") {
            onProgress(msg);
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        clearTimers();
        scheduleReconnect(currentJobId);
      };
    },
    [onProgress, clearTimers],
  );

  const resetHeartbeatTimeout = () => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }
    heartbeatTimeoutRef.current = setTimeout(() => {
      wsRef.current?.close();
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const scheduleReconnect = (currentJobId: string) => {
    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
      RECONNECT_MAX_DELAY_MS,
    );
    reconnectAttemptRef.current = attempt + 1;

    reconnectTimerRef.current = setTimeout(() => {
      connect(currentJobId);
    }, delay);
  };

  useEffect(() => {
    if (!jobId) return;

    connect(jobId);

    return () => {
      clearTimers();
      wsRef.current?.close();
    };
  }, [jobId, connect, clearTimers]);
}
