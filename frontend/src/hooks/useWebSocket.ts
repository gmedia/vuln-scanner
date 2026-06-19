import { useEffect, useRef } from "react";
import { getWsUrl } from "@/api/scans";

interface ProgressMessage {
  type: "progress";
  step: string;
  progress: number;
  message: string;
}

export function useWebSocket(
  jobId: string | null,
  onProgress: (msg: ProgressMessage) => void
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const ws = new WebSocket(getWsUrl(jobId));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
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

    return () => {
      ws.close();
    };
  }, [jobId, onProgress]);
}
