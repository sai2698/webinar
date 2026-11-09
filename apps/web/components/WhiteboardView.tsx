import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { AnnotationStroke, AnnotationTool, PresentationState } from '@webinar/shared';

interface WhiteboardViewProps {
  presentation: PresentationState;
  isStaff: boolean;
  emit: (event: string, payload?: unknown) => void;
  onToggleFullscreen?: () => void;
  canFullscreen?: boolean;
}

const COLORS = [
  { label: 'Slate', value: '#1e293b' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Rose', value: '#ef4444' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Purple', value: '#8b5cf6' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'White', value: '#ffffff' },
];

const STROKE_WIDTHS = [
  { label: 'Thin', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Thick', value: 8 },
];

export function WhiteboardView({
  presentation,
  isStaff,
  emit,
  onToggleFullscreen,
  canFullscreen,
}: WhiteboardViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  /*
   * The toolbar is a single row that can be wider than the stage. When it
   * overflows we need to tell the user there is more to the right, otherwise
   * the trailing controls (undo / clear / zoom) look like they do not exist.
   */
  const [toolbarOverflow, setToolbarOverflow] = useState({
    left: false,
    right: false,
  });

  // Canvas Viewport State (pan & zoom)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [followHost, setFollowHost] = useState(true);

  // Active Tool & Properties
  const [tool, setTool] = useState<AnnotationTool | 'hand'>('pen');
  const [color, setColor] = useState(COLORS[1].value); // Blueprint blue by default
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fillShape, setFillShape] = useState(false);

  // Inline text input state
  const [textInput, setTextInput] = useState<{
    worldX: number;
    worldY: number;
    text: string;
  } | null>(null);

  // Interaction refs
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 });
  const spacePressedRef = useRef(false);
  const draftStrokeRef = useRef<AnnotationStroke | null>(null);
  const isDrawingRef = useRef(false);
  const viewportSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Local undo stack for host
  const [historyIds, setHistoryIds] = useState<string[]>([]);

  // Keep track of presentation annotations
  const annotations = presentation.annotations || [];

  // Sync viewport from host if participant is following
  useEffect(() => {
    if (!isStaff && followHost && presentation.whiteboardViewport) {
      setPan({
        x: presentation.whiteboardViewport.panX,
        y: presentation.whiteboardViewport.panY,
      });
      setZoom(presentation.whiteboardViewport.zoom);
    }
  }, [isStaff, followHost, presentation.whiteboardViewport]);

  // Broadcast viewport changes when host pans or zooms
  const syncViewportToRoom = useCallback(
    (newPan: { x: number; y: number }, newZoom: number) => {
      if (!isStaff) return;
      if (viewportSyncTimerRef.current) clearTimeout(viewportSyncTimerRef.current);
      viewportSyncTimerRef.current = setTimeout(() => {
        emit('whiteboardViewport', {
          panX: Math.round(newPan.x),
          panY: Math.round(newPan.y),
          zoom: Number(newZoom.toFixed(3)),
        });
      }, 50);
    },
    [isStaff, emit]
  );

  // Spacebar pan mode listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spacePressedRef.current && (e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
        spacePressedRef.current = true;
        if (containerRef.current) containerRef.current.style.cursor = 'grab';
      }
      // Quick tool shortcuts
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'v' || e.key === 'h') setTool('hand');
      else if (e.key === 'p') setTool('pen');
      else if (e.key === 'r') setTool('rectangle');
      else if (e.key === 'c' || e.key === 'o') setTool('circle');
      else if (e.key === 'a') setTool('arrow');
      else if (e.key === 'l') setTool('line');
      else if (e.key === 't') setTool('text');
      else if (e.key === 'e') setTool('eraser');
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
        if (containerRef.current) {
          containerRef.current.style.cursor = tool === 'hand' ? 'grab' : 'crosshair';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [tool]);

  // Coordinate Conversion
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const wx = (clientX - rect.left - pan.x) / zoom;
      const wy = (clientY - rect.top - pan.y) / zoom;
      return { x: wx, y: wy };
    },
    [pan, zoom]
  );

  // Redraw full canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Apply viewport transform (pan & zoom)
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Helper to draw a single stroke / element
    const renderStroke = (stroke: AnnotationStroke) => {
      ctx.save();
      ctx.lineWidth = stroke.width || 3;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.fillColor || stroke.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'highlighter') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = (stroke.width || 4) * 3;
      }

      const pts = stroke.points;
      if (!pts || pts.length < 2) {
        ctx.restore();
        return;
      }

      if (stroke.tool === 'pen' || stroke.tool === 'highlighter') {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        if (pts.length === 2) {
          ctx.arc(pts[0], pts[1], ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          for (let i = 2; i < pts.length; i += 2) {
            ctx.lineTo(pts[i], pts[i + 1]);
          }
          ctx.stroke();
        }
      } else if (stroke.tool === 'rectangle') {
        const x = Math.min(pts[0], pts[2]);
        const y = Math.min(pts[1], pts[3]);
        const w = Math.abs(pts[2] - pts[0]);
        const h = Math.abs(pts[3] - pts[1]);
        if (stroke.fillColor) {
          ctx.fillStyle = stroke.fillColor;
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeRect(x, y, w, h);
      } else if (stroke.tool === 'circle') {
        const cx = (pts[0] + pts[2]) / 2;
        const cy = (pts[1] + pts[3]) / 2;
        const rx = Math.abs(pts[2] - pts[0]) / 2;
        const ry = Math.abs(pts[3] - pts[1]) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
        if (stroke.fillColor) {
          ctx.fillStyle = stroke.fillColor;
          ctx.fill();
        }
        ctx.stroke();
      } else if (stroke.tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        ctx.lineTo(pts[2], pts[3]);
        ctx.stroke();
      } else if (stroke.tool === 'arrow') {
        // Draw main line
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        ctx.lineTo(pts[2], pts[3]);
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(pts[3] - pts[1], pts[2] - pts[0]);
        const headLen = Math.max(12, (stroke.width || 3) * 3);
        const a1 = angle - Math.PI / 6;
        const a2 = angle + Math.PI / 6;

        ctx.beginPath();
        ctx.moveTo(pts[2], pts[3]);
        ctx.lineTo(pts[2] - headLen * Math.cos(a1), pts[3] - headLen * Math.sin(a1));
        ctx.lineTo(pts[2] - headLen * Math.cos(a2), pts[3] - headLen * Math.sin(a2));
        ctx.closePath();
        ctx.fillStyle = stroke.color;
        ctx.fill();
      } else if (stroke.tool === 'text' && stroke.text) {
        const fontSize = stroke.fontSize || 20;
        ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = stroke.color;
        const lines = stroke.text.split('\n');
        const lineHeight = fontSize * 1.3;
        lines.forEach((line, i) => {
          ctx.fillText(line, pts[0], pts[1] + (i + 1) * lineHeight);
        });
      }

      ctx.restore();
    };

    // Render all saved annotations
    for (const stroke of annotations) {
      renderStroke(stroke);
    }

    // Render current in-progress draft stroke
    if (draftStrokeRef.current) {
      renderStroke(draftStrokeRef.current);
    }

    ctx.restore();
  }, [pan, zoom, annotations]);

  // Keep canvas sized to its container
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);

      redrawCanvas();
    };

    handleResize();
    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [redrawCanvas]);

  // Trigger redraw on state change
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  /*
   * Toolbar overflow tracking + wheel-to-horizontal scrolling.
   *
   * A horizontal-only scroll container ignores a plain mouse wheel, so on a
   * narrow stage the controls past the right edge were effectively
   * unreachable. Translating vertical wheel deltas into `scrollLeft` makes the
   * whole bar reachable with the wheel, and the edge flags drive the fade
   * affordances so it is obvious the row continues.
   */
  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar) return;

    const update = () => {
      const max = bar.scrollWidth - bar.clientWidth;
      setToolbarOverflow({
        left: bar.scrollLeft > 1,
        right: max > 1 && bar.scrollLeft < max - 1,
      });
    };

    const onWheel = (e: WheelEvent) => {
      if (bar.scrollWidth <= bar.clientWidth) return;
      // Trackpads already send horizontal deltas; only remap vertical ones.
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      const max = bar.scrollWidth - bar.clientWidth;
      const next = Math.max(0, Math.min(max, bar.scrollLeft + delta));
      if (next === bar.scrollLeft) return;
      e.preventDefault();
      bar.scrollLeft = next;
    };

    update();
    bar.addEventListener('scroll', update, { passive: true });
    bar.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(bar);

    return () => {
      bar.removeEventListener('scroll', update);
      bar.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, []);

  // Handle Zoom
  const handleZoom = useCallback(
    (delta: number, centerClientX?: number, centerClientY?: number) => {
      setFollowHost(false);
      setZoom((prevZoom) => {
        const newZoom = Math.min(4, Math.max(0.15, prevZoom * delta));
        if (containerRef.current && centerClientX !== undefined && centerClientY !== undefined) {
          const rect = containerRef.current.getBoundingClientRect();
          const cx = centerClientX - rect.left;
          const cy = centerClientY - rect.top;
          setPan((prevPan) => {
            const nextPan = {
              x: cx - (cx - prevPan.x) * (newZoom / prevZoom),
              y: cy - (cy - prevPan.y) * (newZoom / prevZoom),
            };
            syncViewportToRoom(nextPan, newZoom);
            return nextPan;
          });
        } else {
          syncViewportToRoom(pan, newZoom);
        }
        return newZoom;
      });
    },
    [pan, syncViewportToRoom]
  );

  const handleZoomReset = () => {
    setFollowHost(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    syncViewportToRoom({ x: 0, y: 0 }, 1);
  };

  const handleCenterContent = () => {
    if (annotations.length === 0) {
      handleZoomReset();
      return;
    }
    // Calculate bounding box of all strokes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const stroke of annotations) {
      const pts = stroke.points;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxX = Math.max(maxX, pts[i]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const contentW = Math.max(100, maxX - minX);
    const contentH = Math.max(100, maxY - minY);

    const fitZoom = Math.min(2, Math.max(0.2, Math.min((rect.width - 100) / contentW, (rect.height - 100) / contentH)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const nextPan = {
      x: rect.width / 2 - centerX * fitZoom,
      y: rect.height / 2 - centerY * fitZoom,
    };

    setFollowHost(false);
    setZoom(fitZoom);
    setPan(nextPan);
    syncViewportToRoom(nextPan, fitZoom);
  };

  // Wheel listener for panning & pinch-zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        handleZoom(factor, e.clientX, e.clientY);
      } else {
        // Pan
        setFollowHost(false);
        setPan((prev) => {
          const next = {
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY,
          };
          syncViewportToRoom(next, zoom);
          return next;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleZoom, zoom, syncViewportToRoom]);

  // Pointer Down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Middle button or hand tool or space pressed -> PAN
    if (e.button === 1 || tool === 'hand' || spacePressedRef.current || !isStaff) {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      setFollowHost(false);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return; // Only primary button for drawing
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY);

    // Eraser Tool
    if (tool === 'eraser') {
      eraseAt(wx, wy);
      return;
    }

    // Text Tool -> place inline text box
    if (tool === 'text') {
      setTextInput({ worldX: wx, worldY: wy, text: '' });
      return;
    }

    // Drawing Tool
    isDrawingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const initialPoints =
      tool === 'pen' || tool === 'highlighter' ? [wx, wy] : [wx, wy, wx, wy];

    draftStrokeRef.current = {
      id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tool,
      color,
      width: strokeWidth,
      points: initialPoints,
      page: 1,
      fillColor: fillShape ? color + '25' : undefined,
    };

    redrawCanvas();
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const nextPan = {
        x: panStartRef.current.startPanX + dx,
        y: panStartRef.current.startPanY + dy,
      };
      setPan(nextPan);
      syncViewportToRoom(nextPan, zoom);
      return;
    }

    if (!isDrawingRef.current || !draftStrokeRef.current) return;
    const { x: wx, y: wy } = toWorld(e.clientX, e.clientY);

    if (tool === 'pen' || tool === 'highlighter') {
      const pts = draftStrokeRef.current.points;
      const lastX = pts[pts.length - 2];
      const lastY = pts[pts.length - 1];
      // Only append if moved at least 2 world units
      if (Math.hypot(wx - lastX, wy - lastY) >= 2 / zoom) {
        pts.push(wx, wy);
        redrawCanvas();
      }
    } else if (
      tool === 'rectangle' ||
      tool === 'circle' ||
      tool === 'arrow' ||
      tool === 'line'
    ) {
      draftStrokeRef.current.points[2] = wx;
      draftStrokeRef.current.points[3] = wy;
      redrawCanvas();
    }
  };

  // Pointer Up / Commit stroke
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      if (containerRef.current) {
        containerRef.current.style.cursor =
          spacePressedRef.current || tool === 'hand' ? 'grab' : 'crosshair';
      }
      return;
    }

    if (!isDrawingRef.current || !draftStrokeRef.current) return;
    isDrawingRef.current = false;

    const completed = draftStrokeRef.current;
    draftStrokeRef.current = null;

    // Minimum distance check for shapes/lines
    if (
      completed.tool === 'rectangle' ||
      completed.tool === 'circle' ||
      completed.tool === 'arrow' ||
      completed.tool === 'line'
    ) {
      const dx = completed.points[2] - completed.points[0];
      const dy = completed.points[3] - completed.points[1];
      if (Math.hypot(dx, dy) < 4) {
        redrawCanvas();
        return;
      }
    }

    // Add to history and emit to room
    setHistoryIds((prev) => [...prev, completed.id]);
    emit('presentationAnnotate', {
      action: 'add',
      strokes: [completed],
      page: 1,
    });

    redrawCanvas();
  };

  // Erase stroke at coordinate
  const eraseAt = (wx: number, wy: number) => {
    const threshold = 18 / zoom;
    const hitIds: string[] = [];

    for (const s of annotations) {
      const pts = s.points;
      if (s.tool === 'rectangle') {
        const x = Math.min(pts[0], pts[2]);
        const y = Math.min(pts[1], pts[3]);
        const w = Math.abs(pts[2] - pts[0]);
        const h = Math.abs(pts[3] - pts[1]);
        if (wx >= x - threshold && wx <= x + w + threshold && wy >= y - threshold && wy <= y + h + threshold) {
          hitIds.push(s.id);
        }
      } else if (s.tool === 'circle') {
        const cx = (pts[0] + pts[2]) / 2;
        const cy = (pts[1] + pts[3]) / 2;
        const rx = Math.abs(pts[2] - pts[0]) / 2;
        const ry = Math.abs(pts[3] - pts[1]) / 2;
        const dist = Math.hypot((wx - cx) / Math.max(1, rx), (wy - cy) / Math.max(1, ry));
        if (Math.abs(dist - 1) < 0.25 || dist <= 1) {
          hitIds.push(s.id);
        }
      } else {
        // Point distance check
        for (let i = 0; i < pts.length; i += 2) {
          if (Math.hypot(wx - pts[i], wy - pts[i + 1]) <= threshold) {
            hitIds.push(s.id);
            break;
          }
        }
      }
    }

    if (hitIds.length > 0) {
      emit('presentationAnnotate', {
        action: 'remove',
        removeIds: hitIds,
        page: 1,
      });
    }
  };

  // Commit text input to canvas
  const handleCommitText = () => {
    if (!textInput || !textInput.text.trim()) {
      setTextInput(null);
      return;
    }

    const stroke: AnnotationStroke = {
      id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tool: 'text',
      color,
      width: 1,
      points: [textInput.worldX, textInput.worldY],
      page: 1,
      text: textInput.text.trim(),
      fontSize: Math.max(16, strokeWidth * 5),
    };

    setHistoryIds((prev) => [...prev, stroke.id]);
    emit('presentationAnnotate', {
      action: 'add',
      strokes: [stroke],
      page: 1,
    });

    setTextInput(null);
  };

  // Undo last action
  const handleUndo = () => {
    if (!isStaff || historyIds.length === 0) return;
    const lastId = historyIds[historyIds.length - 1];
    setHistoryIds((prev) => prev.slice(0, -1));
    emit('presentationAnnotate', {
      action: 'remove',
      removeIds: [lastId],
      page: 1,
    });
  };

  // Clear All
  const handleClearAll = () => {
    if (!isStaff) return;
    if (window.confirm('Clear all drawings on the whiteboard?')) {
      setHistoryIds([]);
      emit('presentationAnnotate', {
        action: 'clearAll',
        page: 1,
      });
    }
  };

  // Export Canvas as PNG
  const handleExportPNG = () => {
    if (annotations.length === 0) {
      alert('The whiteboard is empty.');
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const stroke of annotations) {
      const pts = stroke.points;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxX = Math.max(maxX, pts[i]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
    }

    const padding = 60;
    const exportW = Math.max(400, Math.ceil(maxX - minX + padding * 2));
    const exportH = Math.max(300, Math.ceil(maxY - minY + padding * 2));

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportW * 2;
    exportCanvas.height = exportH * 2;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(2, 2);
    // Fill clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportW, exportH);

    // Subtle grid
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    for (let x = 0; x < exportW; x += 24) {
      for (let y = 0; y < exportH; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.translate(padding - minX, padding - minY);

    // Render strokes
    for (const stroke of annotations) {
      ctx.save();
      ctx.lineWidth = stroke.width || 3;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.fillColor || stroke.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'highlighter') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = (stroke.width || 4) * 3;
      }

      const pts = stroke.points;
      if (stroke.tool === 'pen' || stroke.tool === 'highlighter') {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) {
          ctx.lineTo(pts[i], pts[i + 1]);
        }
        ctx.stroke();
      } else if (stroke.tool === 'rectangle') {
        const x = Math.min(pts[0], pts[2]);
        const y = Math.min(pts[1], pts[3]);
        const w = Math.abs(pts[2] - pts[0]);
        const h = Math.abs(pts[3] - pts[1]);
        if (stroke.fillColor) {
          ctx.fillStyle = stroke.fillColor;
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeRect(x, y, w, h);
      } else if (stroke.tool === 'circle') {
        const cx = (pts[0] + pts[2]) / 2;
        const cy = (pts[1] + pts[3]) / 2;
        const rx = Math.abs(pts[2] - pts[0]) / 2;
        const ry = Math.abs(pts[3] - pts[1]) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
        if (stroke.fillColor) {
          ctx.fillStyle = stroke.fillColor;
          ctx.fill();
        }
        ctx.stroke();
      } else if (stroke.tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        ctx.lineTo(pts[2], pts[3]);
        ctx.stroke();
      } else if (stroke.tool === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        ctx.lineTo(pts[2], pts[3]);
        ctx.stroke();
        const angle = Math.atan2(pts[3] - pts[1], pts[2] - pts[0]);
        const headLen = Math.max(12, (stroke.width || 3) * 3);
        const a1 = angle - Math.PI / 6;
        const a2 = angle + Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(pts[2], pts[3]);
        ctx.lineTo(pts[2] - headLen * Math.cos(a1), pts[3] - headLen * Math.sin(a1));
        ctx.lineTo(pts[2] - headLen * Math.cos(a2), pts[3] - headLen * Math.sin(a2));
        ctx.closePath();
        ctx.fillStyle = stroke.color;
        ctx.fill();
      } else if (stroke.tool === 'text' && stroke.text) {
        const fontSize = stroke.fontSize || 20;
        ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = stroke.color;
        const lines = stroke.text.split('\n');
        const lineHeight = fontSize * 1.3;
        lines.forEach((line, i) => {
          ctx.fillText(line, pts[0], pts[1] + (i + 1) * lineHeight);
        });
      }
      ctx.restore();
    }

    const a = document.createElement('a');
    a.download = `whiteboard-${Date.now()}.png`;
    a.href = exportCanvas.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="relative flex h-full w-full select-none flex-col overflow-hidden bg-slate-50 dark:bg-ink-950">
      {/*
       * The canvas viewport is its own box so the toolbar below can be a
       * normal flex row instead of a floating overlay. `containerRef` stays
       * on this element — every measurement (resize, zoom-to-cursor, fit)
       * is relative to the drawable area, not the whole panel.
       */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(148, 163, 184, 0.25) 1.2px, transparent 1.2px)`,
          backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          cursor: tool === 'hand' ? 'grab' : 'crosshair',
        }}
      >
        {/* ── Main Interactive Canvas ── */}
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="absolute inset-0 h-full w-full touch-none"
        />

        {/* ── Inline Text Input Box ── */}
        {textInput && (
          <div
            className="absolute z-30"
            style={{
              left: `${textInput.worldX * zoom + pan.x}px`,
              top: `${textInput.worldY * zoom + pan.y}px`,
              transform: 'translate(0, 0)',
            }}
          >
            <textarea
              autoFocus
              rows={2}
              value={textInput.text}
              onChange={(e) => setTextInput({ ...textInput, text: e.target.value })}
              onBlur={handleCommitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommitText();
                }
              }}
              placeholder="Type note... (Enter to save)"
              className="rounded-lg border-2 border-brand-500 bg-white/95 p-2 text-sm font-semibold shadow-2xl outline-none backdrop-blur dark:bg-ink-900/95"
              style={{
                color,
                fontSize: `${Math.max(16, strokeWidth * 5) * zoom}px`,
                minWidth: `${180 * zoom}px`,
              }}
            />
          </div>
        )}
      </div>

      {/* ── Bottom Toolbar: single row, mirrors the file-presentation bar ── */}

      <div className="relative shrink-0">
        <div
          ref={toolbarRef}
          className="flex items-center gap-1 overflow-x-auto overflow-y-hidden border-t border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur dark:border-white/10 dark:bg-ink-900/95 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-white/20"
        >
          {/* Navigation / Hand tool */}
          <button
            type="button"
            onClick={() => setTool('hand')}
            title="Hand / Pan tool (V or Space+Drag)"
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm transition active:scale-95 ${
              tool === 'hand'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {isStaff && (
          <>
            <div className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-white/10" />

            {/* Pen Tool */}
            <button
              type="button"
              onClick={() => setTool('pen')}
              title="Pen tool (P)"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm transition active:scale-95 ${
                tool === 'pen'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Highlighter Tool */}
            <button
              type="button"
              onClick={() => setTool('highlighter')}
              title="Highlighter tool"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm transition active:scale-95 ${
                tool === 'highlighter'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M9 11l-6 6v3h3l6-6M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Arrow Tool */}
            <button
              type="button"
              onClick={() => setTool('arrow')}
              title="Arrow tool (A)"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm transition active:scale-95 ${
                tool === 'arrow'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M7 17L17 7M17 7H8M17 7v9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Line Tool */}
            <button
              type="button"
              onClick={() => setTool('line')}
              title="Line tool (L)"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm transition active:scale-95 ${
                tool === 'line'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M5 19L19 5" strokeLinecap="round" />
              </svg>
            </button>

            {/* Rectangle Tool */}
            <button
              type="button"
              onClick={() => setTool('rectangle')}
              title="Rectangle tool (R)"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm transition active:scale-95 ${
                tool === 'rectangle'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <rect x="3" y="5" width="18" height="14" rx="2" />
              </svg>
            </button>

            {/* Circle Tool */}
            <button
              type="button"
              onClick={() => setTool('circle')}
              title="Circle / Ellipse tool (O)"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm transition active:scale-95 ${
                tool === 'circle'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <circle cx="12" cy="12" r="9" />
              </svg>
            </button>

            {/* Text Tool */}
            <button
              type="button"
              onClick={() => setTool('text')}
              title="Text tool (T) - click on canvas to add note"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm font-bold transition active:scale-95 ${
                tool === 'text'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M4 7V5h16v2M12 5v14M9 19h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Eraser Tool */}
            <button
              type="button"
              onClick={() => setTool('eraser')}
              title="Eraser tool (E)"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm transition active:scale-95 ${
                tool === 'eraser'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M20 20H7L3 16a2 2 0 0 1 0-2.8l9-9a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L11 20" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-white/10" />

            {/* Color Palette */}
            <div className="flex shrink-0 items-center gap-1 px-0.5">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  className={`h-4 w-4 shrink-0 rounded-full border border-black/10 transition active:scale-90 dark:border-white/20 ${
                    color === c.value ? 'ring-2 ring-brand-500 ring-offset-1 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>

            {/* Stroke Width Picker */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
              {STROKE_WIDTHS.map((sw) => (
                <button
                  key={sw.value}
                  type="button"
                  onClick={() => setStrokeWidth(sw.value)}
                  title={`${sw.label} stroke`}
                  className={`h-6 rounded px-1.5 text-[10px] font-semibold transition ${
                    strokeWidth === sw.value
                      ? 'bg-white text-brand-600 shadow-xs dark:bg-ink-800 dark:text-brand-300'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {sw.label}
                </button>
              ))}
            </div>

            {/* Fill shapes toggle */}
            {(tool === 'rectangle' || tool === 'circle') && (
              <button
                type="button"
                onClick={() => setFillShape(!fillShape)}
                title="Toggle shape fill"
                className={`h-6 shrink-0 rounded-md border px-2 text-[10px] font-semibold transition ${
                  fillShape
                    ? 'border-brand-500/40 bg-brand-500/10 text-brand-600 dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Fill
              </button>
            )}

            <div className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-white/10" />

            {/* Undo */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIds.length === 0}
              title="Undo (Ctrl+Z)"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Clear All */}
            <button
              type="button"
              onClick={handleClearAll}
              disabled={annotations.length === 0}
              title="Clear all drawings"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-rose-500 transition hover:bg-rose-50 disabled:opacity-30 dark:hover:bg-rose-500/10"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}

        <div className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-white/10" />

        {/* Export image */}
        <button
          type="button"
          onClick={handleExportPNG}
          title="Download snapshot as PNG"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M12 3v12M7 10l5 5 5-5M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-white/10" />

        {/* Zoom controls */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
          <button
            type="button"
            onClick={() => handleZoom(0.85)}
            disabled={zoom <= 0.2}
            title="Zoom out"
            className="grid h-6 w-6 place-items-center rounded text-slate-600 transition hover:bg-white disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleZoomReset}
            title="Reset zoom to 100%"
            className="min-w-[38px] text-center font-mono text-[10px] font-semibold tabular-nums text-slate-600 hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-300"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1.15)}
            disabled={zoom >= 4}
            title="Zoom in"
            className="grid h-6 w-6 place-items-center rounded text-slate-600 transition hover:bg-white disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleCenterContent}
            title="Center and fit content"
            className="h-6 rounded px-1.5 text-[10px] font-semibold text-slate-600 transition hover:bg-white dark:text-slate-300 dark:hover:bg-white/10"
          >
            Fit
          </button>
        </div>

        {/* Participant "Follow Host" status indicator */}
        {!isStaff && (
          <button
            type="button"
            onClick={() => {
              setFollowHost(true);
              if (presentation.whiteboardViewport) {
                setPan({
                  x: presentation.whiteboardViewport.panX,
                  y: presentation.whiteboardViewport.panY,
                });
                setZoom(presentation.whiteboardViewport.zoom);
              }
            }}
            className={`flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold transition active:scale-95 ${
              followHost
                ? 'border-mint-500/30 bg-mint-500/10 text-mint-700 dark:border-mint-400/30 dark:text-mint-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:border-amber-400/30 dark:text-amber-200 animate-pulse'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${followHost ? 'bg-mint-500' : 'bg-amber-500'}`} />
            <span>{followHost ? 'Following Host' : 'Snap to Host'}</span>
          </button>
        )}

        {/* Shortcut hint */}
        <div className="ml-auto hidden shrink-0 items-center gap-1.5 pl-2 text-[10px] font-medium text-slate-500 lg:flex dark:text-slate-400">
          <span>Space + Drag to pan</span>
          <span className="text-slate-300 dark:text-white/20">·</span>
          <span>Scroll to zoom</span>
        </div>

        {canFullscreen && onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            title="Toggle fullscreen"
            className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:text-slate-900 lg:ml-1 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        </div>

        {/*
         * Edge fades. They are pointer-events-none overlays so they never
         * steal a click from the controls underneath, and they only appear
         * while there is actually more toolbar to scroll to.
         */}
        {toolbarOverflow.left && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent dark:from-ink-900" />
        )}
        {toolbarOverflow.right && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent dark:from-ink-900" />
        )}
      </div>
    </div>
  );
}

