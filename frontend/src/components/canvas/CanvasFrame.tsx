/**
 * CanvasFrame — the shared iframe + postMessage bridge for both the designer
 * and guest canvases. ALL protocol logic lives here.
 *
 * The proxied document runs at an OPAQUE origin (CSP `sandbox allow-scripts`),
 * so inbound messages carry origin "null". The real authentication is identity:
 * we only accept messages whose `event.source` IS this iframe's contentWindow.
 * Outbound messages target "*" (an opaque-origin frame has no addressable
 * origin) and the agent validates they come from window.parent.
 *
 * Provide exactly one of `src` (public guest endpoint, loads directly) or
 * `srcDoc` (designer — HTML fetched with auth, since an iframe can't send a
 * Bearer header).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  isRdInboundMessage,
  type CanvasClickCoords,
  type CanvasMode,
  type PinData,
  type RdOutboundMessage,
} from "@/types/canvas";

interface CanvasFrameProps {
  src?: string;
  srcDoc?: string;
  mode: CanvasMode;
  pins: PinData[];
  focusPinId?: string | null;
  onReady?: (info: { pageUrl: string; docHeight: number }) => void;
  onCanvasClick?: (coords: CanvasClickCoords) => void;
  onNavigate?: (path: string) => void;
  onPinClick?: (id: string) => void;
  onUnplaced?: (ids: string[]) => void;
  className?: string;
}

export function CanvasFrame({
  src,
  srcDoc,
  mode,
  pins,
  focusPinId,
  onReady,
  onCanvasClick,
  onNavigate,
  onPinClick,
  onUnplaced,
  className,
}: CanvasFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  // Keep the latest callbacks in a ref so the message listener stays stable.
  const handlers = useRef({
    onReady,
    onCanvasClick,
    onNavigate,
    onPinClick,
    onUnplaced,
  });
  handlers.current = { onReady, onCanvasClick, onNavigate, onPinClick, onUnplaced };

  const post = useCallback((msg: RdOutboundMessage) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  useEffect(() => {
    function handle(event: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      if (!isRdInboundMessage(event.data)) return;
      const msg = event.data;
      switch (msg.type) {
        case "rd:ready":
          setReady(true);
          handlers.current.onReady?.({
            pageUrl: msg.pageUrl,
            docHeight: msg.docHeight,
          });
          break;
        case "rd:click":
          handlers.current.onCanvasClick?.({
            selector: msg.selector,
            percentX: msg.percentX,
            percentY: msg.percentY,
            absX: msg.absX,
            absY: msg.absY,
            clientX: msg.clientX,
            clientY: msg.clientY,
            viewportWidth: msg.viewportWidth,
            viewportHeight: msg.viewportHeight,
            pageUrl: msg.pageUrl,
          });
          break;
        case "rd:navigate":
          handlers.current.onNavigate?.(msg.path);
          break;
        case "rd:pin-click":
          handlers.current.onPinClick?.(msg.id);
          break;
        case "rd:unplaced":
          handlers.current.onUnplaced?.(msg.ids);
          break;
      }
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

  // A new document means a new agent: wait for its fresh rd:ready handshake.
  useEffect(() => {
    setReady(false);
  }, [src, srcDoc]);

  useEffect(() => {
    if (ready) post({ type: "rd:set-mode", mode });
  }, [ready, mode, post]);

  useEffect(() => {
    if (ready) post({ type: "rd:render-pins", pins });
  }, [ready, pins, post]);

  useEffect(() => {
    if (ready && focusPinId) post({ type: "rd:focus-pin", id: focusPinId });
  }, [ready, focusPinId, post]);

  return (
    <iframe
      ref={iframeRef}
      title="Website preview"
      sandbox="allow-scripts"
      src={src}
      srcDoc={srcDoc}
      className={cn("h-full w-full border-0 bg-white", className)}
    />
  );
}
