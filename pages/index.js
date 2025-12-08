import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import SelectionOverlay from "@/components/SelectionOverlay";
import SelectionToolbar from "@/components/SelectionToolbar";
import HelperToolbar from "@/components/HelperToolbar";
import PositionPanel from "@/components/PositionPanel";
import useInfograhisData from "@/hooks/useInfographicData";
import { useContext } from "react";
import { InfographicsContext } from "@/pages/_app"; // wherever you placed it
import { observer } from "mobx-react-lite";
import {
  baseCanvas,
  textVariants,
  cornerHandles,
  imageSideHandles,
  textSideHandles,
  textHorizontalHandles,
  clampCropValue,
  getCropValues,
  hasNumericSize,
  buildBlockStyle,
  fontFamilies,
} from "@/utils/canvasConfig";
import {
  MoveCommand,
  ResizeCommand,
  RotateCommand,
  CropCommand,
  AddBlockCommand,
  TextChangeCommand,
  DuplicateCommand,
  DeleteBlockCommand,
  GroupCommand,
  UngroupCommand,
  ZIndexCommand,
  GroupTransformCommand,
  SetBackgroundCommand,
  AddPageCommand,
  RemovePageCommand,
} from "@/stores/commands";

const deepClone = (v) => {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    // fallback to structuredClone if available, otherwise return shallow copy
    if (typeof structuredClone === "function") return structuredClone(v);
    if (v && typeof v === "object")
      return Array.isArray(v) ? v.slice() : { ...v };
    return v;
  }
};

function Home() {
  const store = useContext(InfographicsContext);
  if (!store) {
    return null; // or a loader UI
  }

  const project = store.project;
  const activePage = store.activePage;
  const activePageId = store.activePageId;
  const activeBlocks = store.blocks;
  const groups = store.groups;
  const getBlockById = store.getBlockById;
  const snapshot = store.beginSnapshot;
  const [selectedIds, setSelectedIds] = useState([]); // supports multi-select and group selection
  const [activeId, setActiveId] = useState(null); // single active id (block id or group id)
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [positionsInitialized, setPositionsInitialized] = useState(false);
  const [isPositionPanelOpen, setIsPositionPanelOpen] = useState(false);
  const [canvasBackground, setCanvasBackground] = useState("");
  const [activeRectState, setActiveRectState] = useState(null);

  const ALIGN_ORDER = ["center", "left", "right", "justify"];
  const LIST_ORDER = ["normal", "bullet", "number"];

  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const workspaceRef = useRef(null);
  const editingOriginalRef = useRef({});
  const measurementRAFRef = useRef(null);
  const handlePointerMoveRef = useRef();
  const endInteractionRef = useRef();

  // -------------------------
  // Initialize positions (same as before)
  // -------------------------
  useEffect(() => {
    if (!canvasRef.current || positionsInitialized) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();

    // read blocks from store
    const blocks = (store.blocks || []).slice();

    const updatedBlocks = blocks.map((block, index) => {
      let updated = { ...block };

      // ensure zIndex exists (fall back to index)
      if (typeof updated.zIndex !== "number") {
        updated.zIndex = index;
      }

      // convert percent positions to px if present (assumes stored percents)
      if (updated.position) {
        const { x, y } = updated.position;
        // guard for numeric percent-like values (0..100)
        if (typeof x === "number" && x <= 100 && x >= -100) {
          updated.position = {
            x: (x / 100) * canvasRect.width,
            y: (y / 100) * canvasRect.height,
          };
        } else {
          // already px or unknown — keep as-is (but clone)
          updated.position = {
            x: updated.position.x ?? 0,
            y: updated.position.y ?? 0,
          };
        }
      }

      // text defaults: width (px) and base font size
      if (updated.type === "text") {
        const defaultWidths = {
          big: 0.76,
          normal: 0.6,
          small: 0.5,
          bold: 0.4,
        };
        const defaultFontSizes = {
          big: 32,
          normal: 18,
          small: 10,
          bold: 24,
        };

        if (!updated.color) updated.color = "#000000";
        const variant = updated.variant || "normal";
        const frac = defaultWidths[variant] ?? 0.6;

        const currentWidth = updated.size?.width;

        let widthPx;
        if (typeof currentWidth === "number") {
          widthPx = currentWidth;
        } else if (
          typeof currentWidth === "string" &&
          currentWidth.endsWith("%")
        ) {
          const num = parseFloat(currentWidth);
          if (!Number.isNaN(num)) {
            widthPx = (num / 100) * canvasRect.width;
          } else {
            widthPx = frac * canvasRect.width;
          }
        } else {
          widthPx = frac * canvasRect.width;
        }

        const baseFontSize =
          typeof updated.fontSize === "number"
            ? updated.fontSize
            : defaultFontSizes[variant] ?? 16;

        updated.size = {
          ...(updated.size || {}),
          width: widthPx,
        };
        updated.fontSize = baseFontSize;
      }

      return updated;
    });

    // write back to store (replace active page blocks)
    if (typeof store.setBlocks === "function") {
      store.setBlocks(updatedBlocks);
    } else {
      // fallback: mutate the active page directly
      const page = store.project.pages.find((p) => p.id === store.activePageId);
      if (page) page.blocks = updatedBlocks;
    }

    setPositionsInitialized(true);
  }, [positionsInitialized, store, canvasRef, setPositionsInitialized]);

  useEffect(() => {
    const onKey = (e) => {
      const cmd = e.ctrlKey || e.metaKey;
      if (!cmd) return;

      // Undo: Cmd/Ctrl + Z
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (store.canUndo) store.undo();
      }
      // Redo: Cmd/Ctrl + Shift + Z  OR  Cmd/Ctrl + Y
      if (
        e.key.toLowerCase() === "y" ||
        (e.key.toLowerCase() === "z" && e.shiftKey)
      ) {
        e.preventDefault();
        if (store.canRedo) store.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  // -------------------------
  // Helpers
  // -------------------------
  const isGroupId = (id) => typeof id === "string" && id.startsWith("g-");
  const getGroupById = useCallback(
    (id) => groups.find((g) => g.id === id),
    [groups]
  );
  const getGroupBlockIds = (group) => {
    if (!group) return [];
    if (Array.isArray(group.childIds) && group.childIds.length)
      return group.childIds.slice();
    if (Array.isArray(group.blockIds) && group.blockIds.length)
      return group.blockIds.slice();
    return [];
  };

  // compute center/top-left of current selection for helper toolbar positioning
  const computeSelectionBounds = useCallback(() => {
    if (!canvasRef.current) return null;
    if (!selectedIds || selectedIds.length === 0) return null;

    const canvasRect = canvasRef.current.getBoundingClientRect();

    // collect DOM rects for each selected id (groups expand to child DOM rects)
    const rects = selectedIds
      .flatMap((id) => {
        if (isGroupId(id)) {
          const g = store.getGroupById?.(id);
          if (!g) return [];
          const childIds =
            Array.isArray(g.childIds) && g.childIds.length
              ? g.childIds
              : Array.isArray(g.blockIds) && g.blockIds.length
              ? g.blockIds
              : [];
          return childIds
            .map((bid) => store.getBlockRef(store.activePageId, bid))
            .filter(Boolean)
            .map((el) => el.getBoundingClientRect());
        } else {
          const el = store.getBlockRef(store.activePageId, id);
          return el ? [el.getBoundingClientRect()] : [];
        }
      })
      .filter(Boolean);

    if (rects.length > 0) {
      const left = Math.min(...rects.map((r) => r.left));
      const top = Math.min(...rects.map((r) => r.top));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const centerX = left + (right - left) / 2;
      const centerY = top + (bottom - top) / 2;
      return { left, top, right, bottom, centerX, centerY };
    }

    // Fallback: compute from store (canvas-local coords) for first selected item
    const firstId = selectedIds[0];
    if (!firstId) return null;

    if (isGroupId(firstId)) {
      const g = store.getGroupById?.(firstId);
      if (!g) return null;
      const left = canvasRect.left + (g.position?.x ?? 0);
      const top = canvasRect.top + (g.position?.y ?? 0);
      const centerX = left + (g.size?.width ?? 0) / 2;
      const centerY = top + (g.size?.height ?? 0) / 2;
      const right = left + (g.size?.width ?? 0);
      const bottom = top + (g.size?.height ?? 0);
      return { left, top, right, bottom, centerX, centerY };
    } else {
      const b = store.getBlockById?.(firstId);
      if (!b) return null;
      const left = canvasRect.left + (b.position?.x ?? 0);
      const top = canvasRect.top + (b.position?.y ?? 0);
      const centerX = left + (b.size?.width ?? 0) / 2;
      const centerY = top + (b.size?.height ?? 0) / 2;
      const right = left + (b.size?.width ?? 0);
      const bottom = top + (b.size?.height ?? 0);
      return { left, top, right, bottom, centerX, centerY };
    }
  }, [selectedIds, store.getBlockRef, isGroupId, store, canvasRef]);

  // --- Text content change (typing) ---
  // Live update only (no undo command per keystroke).
  const handleTextChange = useCallback(
    (blockId, value) => {
      if (!blockId) return;
      // immediate live update
      store.updateBlock(blockId, { content: value });
    },
    [store]
  );

  // --- Opacity change (undoable) ---
  const handleChangeOpacity = useCallback(
    (value) => {
      if (!activeId) return;
      const b = store.getBlockById?.(activeId);
      if (!b) return;
      const oldValue = typeof b.opacity === "number" ? b.opacity : 1;
      if (oldValue === value) return;

      // live update
      store.updateBlock(activeId, { opacity: value });

      // push undoable command
      const cmd = {
        do(s) {
          s.updateBlock(activeId, { opacity: value });
        },
        undo(s) {
          s.updateBlock(activeId, { opacity: oldValue });
        },
      };
      store.applyCommand(cmd);
    },
    [store, activeId]
  );

  // you can capture the pre-edit snapshot when editing starts and compare here.
  const stopEditing = useCallback(() => {
    const blockId = editingBlockId;
    if (blockId) {
      const oldContent = editingOriginalRef.current[blockId];
      const b = store.getBlockById?.(blockId);
      const newContent = b ? b.content : null;

      // if changed, push a single TextChangeCommand into MobX command stack
      if (oldContent !== newContent) {
        // TextChangeCommand expects (blockId, oldPatch, newPatch)
        store.applyCommand(
          TextChangeCommand(
            blockId,
            { content: oldContent ?? "" },
            { content: newContent ?? "" }
          )
        );
      }

      // cleanup
      delete editingOriginalRef.current[blockId];
    }

    // clear UI editing state
    setEditingBlockId(null);
  }, [editingBlockId, store]);

  // --- Flip horizontal (undoable) ---
  const handleFlipHorizontal = useCallback(() => {
    if (!activeId) return;
    const b = store.getBlockById?.(activeId);
    if (!b) return;
    const oldVal = !!b.flipH;
    const newVal = !oldVal;

    // live
    store.updateBlock(activeId, { flipH: newVal });

    const cmd = {
      do(s) {
        s.updateBlock(activeId, { flipH: newVal });
      },
      undo(s) {
        s.updateBlock(activeId, { flipH: oldVal });
      },
    };
    store.applyCommand(cmd);
  }, [store, activeId]);

  // --- Flip vertical (undoable) ---
  const handleFlipVertical = useCallback(() => {
    if (!activeId) return;
    const b = store.getBlockById?.(activeId);
    if (!b) return;
    const oldVal = !!b.flipV;
    const newVal = !oldVal;

    // live
    store.updateBlock(activeId, { flipV: newVal });

    const cmd = {
      do(s) {
        s.updateBlock(activeId, { flipV: newVal });
      },
      undo(s) {
        s.updateBlock(activeId, { flipV: oldVal });
      },
    };
    store.applyCommand(cmd);
  }, [store, activeId]);

  // --- Border radius change (undoable) ---
  const handleChangeBorderRadius = useCallback(
    (value) => {
      if (!activeId) return;
      const b = store.getBlockById?.(activeId);
      if (!b) return;
      const oldVal = typeof b.borderRadius !== "undefined" ? b.borderRadius : 0;
      if (oldVal === value) return;

      // live update
      store.updateBlock(activeId, { borderRadius: value });

      // push undoable command
      const cmd = {
        do(s) {
          s.updateBlock(activeId, { borderRadius: value });
        },
        undo(s) {
          s.updateBlock(activeId, { borderRadius: oldVal });
        },
      };
      store.applyCommand(cmd);
    },
    [store, activeId]
  );

  const handleChangeFontFamily = useCallback(
    (fontValue) => {
      if (!fontValue) return;

      // Resolve selection (prefer selectedIds, fallback to activeId)
      const selIds =
        selectedIds && selectedIds.length
          ? selectedIds.slice()
          : activeId
          ? [activeId]
          : [];

      if (selIds.length === 0) return;

      // If single selection is a group, expand to group's child text blocks
      let targetIds = selIds;
      if (selIds.length === 1 && isGroupId(selIds[0])) {
        const g = store.getGroupById?.(selIds[0]);
        if (!g) return;
        targetIds =
          Array.isArray(g.childIds) && g.childIds.length
            ? g.childIds.slice()
            : Array.isArray(g.blockIds) && g.blockIds.length
            ? g.blockIds.slice()
            : [];
      }

      // Filter to existing text blocks
      const textIds = targetIds.filter((id) => {
        const b = store.getBlockById?.(id);
        return b && b.type === "text";
      });

      if (textIds.length === 0) return;

      // Build old/new maps
      const oldMap = {};
      const newMap = {};
      textIds.forEach((id) => {
        const b = store.getBlockById(id);
        oldMap[id] = {
          fontFamily: typeof b.fontFamily !== "undefined" ? b.fontFamily : null,
        };
        newMap[id] = { fontFamily: fontValue };
      });

      // Apply live updates
      textIds.forEach((id) => store.updateBlock(id, { fontFamily: fontValue }));

      // Batch command for undo/redo
      const cmd = {
        do(s) {
          Object.entries(newMap).forEach(([id, patch]) =>
            s.updateBlock(id, patch)
          );
        },
        undo(s) {
          Object.entries(oldMap).forEach(([id, patch]) =>
            s.updateBlock(id, patch)
          );
        },
      };

      store.applyCommand(cmd);
    },
    [store, selectedIds, activeId, isGroupId]
  );

  // -------------------------
  // Compute active entity (block or group)
  // -------------------------
  const activeGroupId = selectedIds.find(isGroupId) || null;
  const activeBlock = activeGroupId
    ? getGroupById(activeGroupId) || null
    : activeBlocks.find((b) => b.id === activeId) || null;

  useLayoutEffect(() => {
    // only measure when there is a real block (not a group)
    if (!activeBlock || isGroupId(activeBlock.id)) {
      setActiveRectState(null);
      return;
    }

    const el = store.getBlockRef(activePageId, activeBlock.id);
    if (!el) {
      setActiveRectState(null);
      return;
    }

    // measure synchronously after DOM updates
    const rect = el.getBoundingClientRect();
    setActiveRectState(rect);

    // second pass on next frame to catch font/layout shifts
    let raf = requestAnimationFrame(() => {
      const el2 = store.getBlockRef(activePageId, activeBlock.id);
      if (!el2) return;
      const rect2 = el2.getBoundingClientRect();
      setActiveRectState(rect2);
    });

    return () => cancelAnimationFrame(raf);
  }, [activeBlock?.id, activeBlocks, activePageId]);

  // DOM rect for active block only when it is a real block (not a group)
  const activeRect = activeRectState;

  const canvasRect = canvasRef.current
    ? canvasRef.current.getBoundingClientRect()
    : null;

  // Handles & crop for active block or group
  let activeCornerHandles = [];
  let activeSideHandles = [];
  let activeCropInsets = {};

  if (activeBlock) {
    // For groups
    if (isGroupId(activeBlock.id)) {
      const group = getGroupById(activeBlock.id);
      if (group && !activeBlock.locked) {
        // Groups always get corner handles for resizing
        activeCornerHandles = cornerHandles;

        const groupBlockIds = Array.isArray(group.blockIds)
          ? group.blockIds
          : Array.isArray(group.childIds)
          ? group.childIds
          : [];
        const hasImages = groupBlockIds.some((id) => {
          const block = activeBlocks.find((b) => b.id === id);
          return block && block.type === "image";
        });

        if (hasImages) {
          activeSideHandles = imageSideHandles;
        }
      }
    }
    // For single blocks
    else if (!activeBlock.locked && hasNumericSize(activeBlock)) {
      activeCropInsets =
        activeBlock.type === "image" ? getCropValues(activeBlock.crop) : {};

      if (activeBlock.type === "image") {
        activeCornerHandles = cornerHandles;
        activeSideHandles = imageSideHandles;
      } else if (activeBlock.type === "text") {
        const isSmallText = activeBlock.variant === "small";
        activeCornerHandles = cornerHandles.filter((h) => h.id === "top-left");
        activeSideHandles = isSmallText
          ? textHorizontalHandles.filter((h) => h.id === "right")
          : textHorizontalHandles;
      } else {
        activeCornerHandles = cornerHandles;
      }
    }
  }

  // Compute toolbar coordinates (helper above selection or block)
  const toolbarCoords = (() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const canvasRect = canvas.getBoundingClientRect();

    // If there's a selection, compute its bounds (for HelperToolbar)
    const selBounds = computeSelectionBounds();

    const helperX = selBounds
      ? selBounds.centerX
      : activeBlock
      ? canvasRect.left +
        (activeBlock.position?.x ?? 0) +
        (activeBlock.size?.width ?? 0) / 2
      : canvasRect.left + 40;
    const helperY = selBounds
      ? selBounds.top - 12
      : activeBlock
      ? canvasRect.top + (activeBlock.position?.y ?? 0) - 12
      : canvasRect.top - 12;

    const selectionX = canvasRect.left + canvasRect.width / 2;
    const selectionY = canvasRect.top - 40;

    return { helperX, helperY, selectionX, selectionY };
  })();

  // -------------------------
  // Render content (unchanged)
  // -------------------------
  const renderBlockContent = useCallback(
    (block) => {
      switch (block.type) {
        case "text": {
          const textClass = textVariants[block.variant] ?? "";
          const isEditing = editingBlockId === block.id;
          const lineCount = (block.content ?? "").split("\n").length;
          const fontSizeStyle = block.fontSize
            ? { fontSize: `${block.fontSize}px` }
            : {};

          // prefer block.color, fallback to block.textColor
          const effectiveTextColor =
            (typeof block.color === "string" && block.color.trim() !== ""
              ? block.color
              : typeof block.textColor === "string" &&
                block.textColor.trim() !== ""
              ? block.textColor
              : undefined) || undefined;

          // font family if provided (string like "Roboto, system-ui")
          const effectiveFont = block.fontFamily || undefined;

          const combinedStyleBase = {
            ...fontSizeStyle,
            textAlign: block.textAlign || "center",
            ...(effectiveFont ? { fontFamily: effectiveFont } : {}),
            ...(effectiveTextColor ? { color: effectiveTextColor } : {}),

            // New: apply toggled styles
            ...(block.bold ? { fontWeight: "900" } : {}),
            ...(block.italic ? { fontStyle: "oblique" } : {}),
            ...(block.underline || block.strike
              ? {
                  textDecoration: `${block.underline ? "underline" : ""} ${
                    block.strike ? "line-through" : ""
                  }`.trim(),
                }
              : {}),
          };

          if (isEditing) {
            return (
              <div className="relative">
                <textarea
                  value={block.content}
                  onChange={(event) => {
                    handleTextChange(block.id, event.target.value);
                  }}
                  onInput={(e) => {
                    // auto-resize: reset height then expand to scrollHeight
                    const ta = e.target;
                    ta.style.height = "auto";
                    // limit growth so it won't overflow the viewport
                    const maxH = Math.max(200, window.innerHeight * 0.6);
                    ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`;
                  }}
                  onBlur={stopEditing}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      stopEditing();
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      stopEditing();
                    }
                  }}
                  /* make the textarea visually transparent & borderless */
                  className={`${textClass} w-full resize-none p-0 text-current focus:outline-none`}
                  rows={Math.max(2, lineCount)}
                  autoFocus
                  spellCheck={false}
                  style={{
                    whiteSpace: "pre-wrap",
                    overflow: "hidden", // hide internal scrollbar
                    background: "transparent", // no white bg
                    border: "none", // no border
                    boxShadow: "none",
                    ...combinedStyleBase, // keep fonts, color, fontWeight, etc.
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                />
                {block.subline && (
                  <p className="mt-2 text-[9px] uppercase tracking-[0.4em] text-slate-400">
                    {block.subline}
                  </p>
                )}
              </div>
            );
          }

          return (
            <div className={textClass} style={combinedStyleBase}>
              {block.listType === "bullet" && (
                <ul style={{ listStyleType: "disc", paddingLeft: "1.2em" }}>
                  {block.content.split("\n").map((line, i) => (
                    <li key={i}>{line || <br />}</li>
                  ))}
                </ul>
              )}

              {block.listType === "number" && (
                <ol style={{ listStyleType: "decimal", paddingLeft: "1.2em" }}>
                  {block.content.split("\n").map((line, i) => (
                    <li key={i}>{line || <br />}</li>
                  ))}
                </ol>
              )}

              {(block.listType === "normal" || !block.listType) && (
                <div style={{ whiteSpace: "pre-wrap" }}>{block.content}</div>
              )}

              {block.subline && (
                <p className="mt-2 text-[9px] uppercase tracking-[0.4em] text-slate-400">
                  {block.subline}
                </p>
              )}
            </div>
          );
        }

        case "line":
          return (
            <span className="block h-px w-full border-t border-slate-200" />
          );

        case "palette":
          return (
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-2">
                {block.colors.map((color) => (
                  <span
                    key={color}
                    className="h-4 w-4 rounded-full border border-white shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          );

        case "image": {
          const crop = getCropValues(block.crop);
          const hasCrop = Object.values(crop).some((value) => value !== 0);
          const clipStyle = hasCrop
            ? {
                clipPath: `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`,
              }
            : undefined;

          const wrapperStyle =
            typeof block.borderRadius === "number"
              ? { borderRadius: `${block.borderRadius}px` }
              : {};

          return (
            <div className="h-full w-full overflow-hidden" style={wrapperStyle}>
              <img
                src={block.src}
                alt={block.alt}
                className="h-full w-full object-cover"
                loading="lazy"
                style={clipStyle}
              />
            </div>
          );
        }

        default:
          return null;
      }
    },
    [editingBlockId, handleTextChange, stopEditing]
  );

  // -------------------------
  // Double click to edit text (unchanged)
  // -------------------------
  const handleBlockDoubleClick = useCallback((event, block) => {
    if (block.type !== "text") return;
    event.preventDefault();
    event.stopPropagation();
    setActiveId(block.id);
    setEditingBlockId(block.id);
  }, []);

  const startEditing = useCallback(
    (blockId) => {
      if (!blockId) return;
      const b = store.getBlockById?.(blockId);
      editingOriginalRef.current[blockId] = b ? b.content : null;
      setActiveId(blockId);
      setEditingBlockId(blockId);
    },
    [store]
  );

  // -------------------------
  // Interaction: move / resize / rotate
  // - supports group move if blockId is group id (g-...)
  // -------------------------
  const handlePointerMove = useCallback(
    (event) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const { blockId, blockSnapshot, canvasRect, type } = interaction;

      // helper: schedule a DOM measurement for given block ids (coalesced)
      const scheduleMeasureForIds = (ids = []) => {
        if (measurementRAFRef.current)
          cancelAnimationFrame(measurementRAFRef.current);
        measurementRAFRef.current = requestAnimationFrame(() => {
          try {
            const elems = (ids || [])
              .map((id) => store.getBlockRef(activePageId, id))
              .filter(Boolean);
            if (elems.length > 0) {
              const rects = elems.map((el) => el.getBoundingClientRect());
              const left = Math.min(...rects.map((r) => r.left));
              const top = Math.min(...rects.map((r) => r.top));
              const right = Math.max(...rects.map((r) => r.right));
              const bottom = Math.max(...rects.map((r) => r.bottom));
              setActiveRectState({
                left,
                top,
                right,
                bottom,
                width: right - left,
                height: bottom - top,
              });
              return;
            }

            // fallback: try single id model-based measurement if no DOM elems found
            if (ids && ids.length === 1) {
              const id = ids[0];
              const blk = store.getBlockById?.(id);
              const canvasR = canvasRef.current?.getBoundingClientRect();
              if (blk && canvasR) {
                const left = canvasR.left + (blk.position?.x ?? 0);
                const top = canvasR.top + (blk.position?.y ?? 0);
                const width = blk.size?.width ?? 0;
                const height = blk.size?.height ?? 0;
                setActiveRectState({
                  left,
                  top,
                  right: left + width,
                  bottom: top + height,
                  width,
                  height,
                });
                return;
              }
            }
          } catch (err) {
            // ignore measurement errors
          } finally {
            measurementRAFRef.current = null;
          }
        });
      };

      // --- GROUP MOVE branch ---
      if (isGroupId(blockId) && type === "move") {
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        // canvasRect captured at beginInteraction (fallback to DOM)
        const capturedCanvasRect =
          interaction.canvasRect || canvasRef.current?.getBoundingClientRect();

        const workspaceRect =
          typeof workspaceRef !== "undefined" && workspaceRef.current
            ? workspaceRef.current.getBoundingClientRect()
            : {
                left: 0,
                top: 0,
                width: window.innerWidth,
                height: window.innerHeight,
              };

        // new group top-left in canvas-local coords
        let newGroupX = (interaction.groupSnapshotPosition?.x ?? 0) + deltaX;
        let newGroupY = (interaction.groupSnapshotPosition?.y ?? 0) + deltaY;

        // compute effective axis-aligned size (account for rotation)
        const gw = interaction.blockSnapshot?.size?.width ?? 0;
        const gh = interaction.blockSnapshot?.size?.height ?? 0;
        const gtheta =
          ((interaction.blockSnapshot?.rotation || 0) * Math.PI) / 180;
        const gc = Math.abs(Math.cos(gtheta));
        const gs = Math.abs(Math.sin(gtheta));
        const effectiveGroupW = Math.abs(gw * gc) + Math.abs(gh * gs);
        const effectiveGroupH = Math.abs(gw * gs) + Math.abs(gh * gc);

        const workspaceLeftInCanvas =
          workspaceRect.left - (capturedCanvasRect?.left ?? 0);
        const workspaceTopInCanvas =
          workspaceRect.top - (capturedCanvasRect?.top ?? 0);
        const workspaceRightInCanvas =
          workspaceLeftInCanvas + workspaceRect.width;
        const workspaceBottomInCanvas =
          workspaceTopInCanvas + workspaceRect.height;

        const allowOutsideFactor = 0.9;
        const minX =
          workspaceLeftInCanvas - effectiveGroupW * allowOutsideFactor;
        const minY =
          workspaceTopInCanvas - effectiveGroupH * allowOutsideFactor;
        const maxX = workspaceRightInCanvas - effectiveGroupW;
        const maxY = workspaceBottomInCanvas - effectiveGroupH;

        const clampedGroupX = Math.min(Math.max(newGroupX, minX), maxX);
        const clampedGroupY = Math.min(Math.max(newGroupY, minY), maxY);

        // Use offsets captured at beginInteraction: interaction.blockOffsets (map id->offset)
        const offsets = interaction.blockOffsets || {};
        const childIds = interaction.groupBlockIds || [];

        // Update each child live
        childIds.forEach((childId) => {
          const offset = offsets[childId] || { x: 0, y: 0 };
          store.updateBlock(childId, {
            position: {
              x: clampedGroupX + offset.x,
              y: clampedGroupY + offset.y,
            },
          });
        });

        // update group meta live so overlay remains in sync
        // group object should exist in store.groups
        if (typeof store.updateGroup === "function") {
          store.updateGroup(blockId, {
            position: { x: clampedGroupX, y: clampedGroupY },
          });
        } else {
          const g = store.getGroupById?.(blockId);
          if (g)
            Object.assign(g, {
              position: { x: clampedGroupX, y: clampedGroupY },
            });
        }

        // schedule measurement for group children so overlay follows
        scheduleMeasureForIds(childIds);

        return;
      }

      // --- GROUP RESIZE branch ---
      if (type === "resize" && isGroupId(blockId)) {
        const groupSnapshot = interaction.blockSnapshot;
        if (!groupSnapshot || !interaction.handle) return;
        const handle = interaction.handle;
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        const startWidth = groupSnapshot.size?.width || 0;
        const startHeight = groupSnapshot.size?.height || 0;
        const startX = groupSnapshot.position?.x || 0;
        const startY = groupSnapshot.position?.y || 0;

        let scaleX = 1;
        let scaleY = 1;
        let newGroupX = startX;
        let newGroupY = startY;
        let newGroupWidth = startWidth;
        let newGroupHeight = startHeight;

        // Calculate scale based on handle
        if (handle.includes("right")) {
          newGroupWidth = Math.max(40, startWidth + deltaX);
          scaleX = newGroupWidth / (startWidth || 1);
        }
        if (handle.includes("left")) {
          const newWidth = Math.max(40, startWidth - deltaX);
          scaleX = newWidth / (startWidth || 1);
          newGroupX = startX + (startWidth - newWidth);
          newGroupWidth = newWidth;
        }
        if (handle.includes("bottom")) {
          newGroupHeight = Math.max(40, startHeight + deltaY);
          scaleY = newGroupHeight / (startHeight || 1);
        }
        if (handle.includes("top")) {
          const newHeight = Math.max(40, startHeight - deltaY);
          scaleY = newHeight / (startHeight || 1);
          newGroupY = startY + (startHeight - newHeight);
          newGroupHeight = newHeight;
        }

        const childSnapshots = interaction.childSnapshots || [];
        const blockOffsets = interaction.blockOffsets || {};
        const groupBlockIds = interaction.groupBlockIds || [];

        // compute per-child live patches
        groupBlockIds.forEach((bid) => {
          const snapshot = childSnapshots.find((s) => s.id === bid) ?? null;
          const offset = blockOffsets[bid] || { x: 0, y: 0 };

          if (!snapshot) return;

          const newOffsetX = offset.x * scaleX;
          const newOffsetY = offset.y * scaleY;

          const newBlockX = newGroupX + newOffsetX;
          const newBlockY = newGroupY + newOffsetY;

          const newSize = { ...(snapshot.size || {}) };
          if (typeof snapshot.size?.width === "number")
            newSize.width = snapshot.size.width * scaleX;
          if (typeof snapshot.size?.height === "number")
            newSize.height = snapshot.size.height * scaleY;

          let newFontSize = snapshot.fontSize;
          // scale fontSize for text blocks
          const blk = store.getBlockById(bid);
          if (
            blk &&
            blk.type === "text" &&
            typeof snapshot.fontSize === "number"
          ) {
            newFontSize = snapshot.fontSize * Math.min(scaleX, scaleY);
          }

          const patch = {
            position: { x: newBlockX, y: newBlockY },
            size: newSize,
          };
          if (typeof newFontSize !== "undefined") patch.fontSize = newFontSize;

          store.updateBlock(bid, patch);
        });

        // update group metadata (position/size/blockOffsets)
        const newOffsets = {};
        Object.entries(blockOffsets).forEach(([id, offset]) => {
          newOffsets[id] = { x: offset.x * scaleX, y: offset.y * scaleY };
        });

        if (typeof store.updateGroup === "function") {
          store.updateGroup(blockId, {
            position: { x: newGroupX, y: newGroupY },
            size: { width: newGroupWidth, height: newGroupHeight },
            blockOffsets: newOffsets,
          });
        } else {
          const g = store.getGroupById?.(blockId);
          if (g)
            Object.assign(g, {
              position: { x: newGroupX, y: newGroupY },
              size: { width: newGroupWidth, height: newGroupHeight },
              blockOffsets: newOffsets,
            });
        }

        // schedule measurement for group children so overlay follows
        scheduleMeasureForIds(groupBlockIds);

        return;
      }

      // --- GROUP CROP branch ---
      if (type === "crop" && isGroupId(blockId)) {
        const group = interaction.blockSnapshot;
        if (!group || !interaction.handle) return;
        const handle = interaction.handle;
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        const startWidth = group.size?.width || 1;
        const startHeight = group.size?.height || 1;

        const cropDeltaX = (deltaX / startWidth) * 100;
        const cropDeltaY = (deltaY / startHeight) * 100;

        const groupBlockIds = getGroupBlockIds(group);

        groupBlockIds.forEach((bid) => {
          const block = store.getBlockById(bid);
          if (!block || block.type !== "image") return;

          const currentCrop = getCropValues(block.crop);
          const nextCrop = { ...currentCrop };

          if (handle === "left")
            nextCrop.left = clampCropValue(currentCrop.left + cropDeltaX);
          if (handle === "right")
            nextCrop.right = clampCropValue(currentCrop.right - cropDeltaX);
          if (handle === "top")
            nextCrop.top = clampCropValue(currentCrop.top + cropDeltaY);
          if (handle === "bottom")
            nextCrop.bottom = clampCropValue(currentCrop.bottom - cropDeltaY);

          // clamp totals
          const totalHorizontal = nextCrop.left + nextCrop.right;
          const totalVertical = nextCrop.top + nextCrop.bottom;
          if (totalHorizontal > 90) {
            const scale = 90 / totalHorizontal;
            nextCrop.left *= scale;
            nextCrop.right *= scale;
          }
          if (totalVertical > 90) {
            const scale = 90 / totalVertical;
            nextCrop.top *= scale;
            nextCrop.bottom *= scale;
          }

          store.updateBlock(bid, { crop: nextCrop });
        });

        // schedule measure (group children) so overlay follows crop changes
        scheduleMeasureForIds(groupBlockIds);

        return;
      }

      // --- GROUP ROTATE branch ---
      if (type === "rotate" && isGroupId(blockId)) {
        const group = interaction.blockSnapshot;
        if (!group) return;

        const { center, startAngle, initialRotation } = interaction;
        const currentAngle = Math.atan2(
          event.clientY - center.y,
          event.clientX - center.x
        );
        const deltaAngle = currentAngle - startAngle;
        const degrees = ((deltaAngle * 180) / Math.PI + initialRotation) % 360;
        const deltaRadians = deltaAngle;
        const deltaDegrees = (deltaRadians * 180) / Math.PI;

        const childSnapshots = interaction.childSnapshots || [];
        const groupSnapshot = interaction.blockSnapshot;
        const groupCx =
          groupSnapshot.position.x + (groupSnapshot.size.width / 2 || 0);
        const groupCy =
          groupSnapshot.position.y + (groupSnapshot.size.height / 2 || 0);

        const updates = {};
        childSnapshots.forEach((snapshot) => {
          const newRotation = (snapshot.rotation || 0) + deltaDegrees;

          const childWidth = snapshot.size?.width || 0;
          const childHeight = snapshot.size?.height || 0;
          const childCx = snapshot.position.x + childWidth / 2;
          const childCy = snapshot.position.y + childHeight / 2;

          const dx = childCx - groupCx;
          const dy = childCy - groupCy;

          const cos = Math.cos(deltaRadians);
          const sin = Math.sin(deltaRadians);
          const newDx = dx * cos - dy * sin;
          const newDy = dx * sin + dy * cos;

          const newChildCx = groupCx + newDx;
          const newChildCy = groupCy + newDy;

          const newX = newChildCx - childWidth / 2;
          const newY = newChildCy - childHeight / 2;

          updates[snapshot.id] = {
            rotation: newRotation,
            position: { x: newX, y: newY },
          };
        });

        // Apply updates to the store
        Object.entries(updates).forEach(([id, patch]) => {
          store.updateBlock(id, patch);
        });

        // Update group meta rotation and blockOffsets for future moves
        const newBlockOffsets = {};
        Object.entries(updates).forEach(([bid, data]) => {
          newBlockOffsets[bid] = {
            x: data.position.x - (groupSnapshot.position.x || 0),
            y: data.position.y - (groupSnapshot.position.y || 0),
          };
        });

        if (typeof store.updateGroup === "function") {
          store.updateGroup(blockId, {
            rotation: degrees,
            blockOffsets: {
              ...(store.getGroupById(blockId)?.blockOffsets || {}),
              ...newBlockOffsets,
            },
          });
        } else {
          const g = store.getGroupById?.(blockId);
          if (g)
            Object.assign(g, {
              rotation: degrees,
              blockOffsets: { ...(g.blockOffsets || {}), ...newBlockOffsets },
            });
        }

        // schedule measurement for children so overlay follows rotation
        scheduleMeasureForIds(Object.keys(updates));

        return;
      }

      // --- SINGLE BLOCK MOVE ---
      if (type === "move") {
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        const capturedCanvasRect =
          interaction.canvasRect || canvasRef.current?.getBoundingClientRect();
        const workspaceRect =
          typeof workspaceRef !== "undefined" && workspaceRef.current
            ? workspaceRef.current.getBoundingClientRect()
            : {
                left: 0,
                top: 0,
                width: window.innerWidth,
                height: window.innerHeight,
              };

        const bSnap = blockSnapshot;
        if (!bSnap) return;

        // candidate top-left
        let nextX = (bSnap.position?.x ?? 0) + deltaX;
        let nextY = (bSnap.position?.y ?? 0) + deltaY;

        // effective size (rotation aware)
        const w = bSnap.size?.width ?? 0;
        const h = bSnap.size?.height ?? 0;
        const theta = ((bSnap.rotation || 0) * Math.PI) / 180;
        const c = Math.abs(Math.cos(theta));
        const s = Math.abs(Math.sin(theta));
        const effectiveW = Math.abs(w * c) + Math.abs(h * s);
        const effectiveH = Math.abs(w * s) + Math.abs(h * c);

        const workspaceLeftInCanvas =
          workspaceRect.left - (capturedCanvasRect?.left ?? 0);
        const workspaceTopInCanvas =
          workspaceRect.top - (capturedCanvasRect?.top ?? 0);
        const workspaceRightInCanvas =
          workspaceLeftInCanvas + workspaceRect.width;
        const workspaceBottomInCanvas =
          workspaceTopInCanvas + workspaceRect.height;

        const allowOutsideFactor = 0.9;
        const minX = workspaceLeftInCanvas - effectiveW * allowOutsideFactor;
        const minY = workspaceTopInCanvas - effectiveH * allowOutsideFactor;
        const maxX = workspaceRightInCanvas - effectiveW;
        const maxY = workspaceBottomInCanvas - effectiveH;

        nextX = Math.min(Math.max(nextX, minX), maxX);
        nextY = Math.min(Math.max(nextY, minY), maxY);

        // Live update single block
        store.updateBlock(bSnap.id, { position: { x: nextX, y: nextY } });

        // schedule measurement on next animation frame (coalesces many pointermoves)
        if (measurementRAFRef.current)
          cancelAnimationFrame(measurementRAFRef.current);
        measurementRAFRef.current = requestAnimationFrame(() => {
          try {
            const el = store.getBlockRef(activePageId, bSnap.id);
            if (el && typeof el.getBoundingClientRect === "function") {
              const rect = el.getBoundingClientRect();
              setActiveRectState(rect);
            } else {
              // fallback: compute from model and canvasRect (keeps overlay approx in place)
              const canvasRectLocal =
                canvasRef.current?.getBoundingClientRect();
              const blk = store.getBlockById?.(bSnap.id);
              if (canvasRectLocal && blk) {
                setActiveRectState({
                  left: canvasRectLocal.left + (blk.position?.x ?? 0),
                  top: canvasRectLocal.top + (blk.position?.y ?? 0),
                  width: blk.size?.width ?? 0,
                  height: blk.size?.height ?? 0,
                  right:
                    canvasRectLocal.left +
                    (blk.position?.x ?? 0) +
                    (blk.size?.width ?? 0),
                  bottom:
                    canvasRectLocal.top +
                    (blk.position?.y ?? 0) +
                    (blk.size?.height ?? 0),
                });
              }
            }
          } catch (e) {
            // ignore occasional measurement errors
          } finally {
            measurementRAFRef.current = null;
          }
        });
      }

      // --- SINGLE BLOCK RESIZE ---
      if (type === "resize" && hasNumericSize(blockSnapshot)) {
        const handle = interaction.handle;
        if (!handle) return;
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        // TEXT scaling from top-left (like Canva)
        if (blockSnapshot.type === "text" && handle === "top-left") {
          const startWidth = blockSnapshot.size.width;
          const minWidth = 20;
          const rightEdge = blockSnapshot.position.x + startWidth;

          let newLeft = blockSnapshot.position.x + deltaX;
          const maxLeft = rightEdge - minWidth;

          newLeft = Math.min(newLeft, maxLeft);
          newLeft = Math.max(0, newLeft);

          const newWidth = rightEdge - newLeft;

          const startFontSize =
            typeof blockSnapshot.fontSize === "number"
              ? blockSnapshot.fontSize
              : 16;

          let scale = newWidth / startWidth;
          scale = Math.max(0.5, Math.min(scale, 3));

          const newFontSize = startFontSize * scale;

          store.updateBlock(blockSnapshot.id, {
            position: { ...blockSnapshot.position, x: newLeft },
            size: { ...(blockSnapshot.size || {}), width: newWidth },
            fontSize: newFontSize,
          });

          // schedule measurement for the resized text block
          scheduleMeasureForIds([blockSnapshot.id]);

          return;
        }

        // Default resize
        const startWidth = blockSnapshot.size.width;
        const startHeight = blockSnapshot.size.height;
        let nextWidth = startWidth;
        let nextHeight = startHeight;
        let nextX = blockSnapshot.position.x;
        let nextY = blockSnapshot.position.y;
        const minSize = 40;
        const canvasRectLocal =
          canvasRect || canvasRef.current?.getBoundingClientRect();

        if (handle.includes("right")) {
          const maxWidth =
            (canvasRectLocal?.width ?? window.innerWidth) -
            blockSnapshot.position.x;
          nextWidth = Math.max(
            minSize,
            Math.min(startWidth + deltaX, maxWidth)
          );
        }
        if (handle.includes("left")) {
          const rightEdge = blockSnapshot.position.x + startWidth;
          let newLeft = blockSnapshot.position.x + deltaX;
          newLeft = Math.min(newLeft, rightEdge - minSize);
          newLeft = Math.max(0, newLeft);
          nextX = newLeft;
          nextWidth = rightEdge - newLeft;
        }

        if (handle.includes("bottom") && typeof startHeight === "number") {
          const maxHeight =
            (canvasRectLocal?.height ?? window.innerHeight) -
            blockSnapshot.position.y;
          nextHeight = Math.max(
            minSize,
            Math.min(startHeight + deltaY, maxHeight)
          );
        }
        if (handle.includes("top") && typeof startHeight === "number") {
          const bottomEdge = blockSnapshot.position.y + startHeight;
          let newTop = blockSnapshot.position.y + deltaY;
          newTop = Math.min(newTop, bottomEdge - minSize);
          newTop = Math.max(0, newTop);
          nextY = newTop;
          nextHeight = bottomEdge - newTop;
        }

        store.updateBlock(blockSnapshot.id, {
          position: { x: nextX, y: nextY },
          size: {
            ...(blockSnapshot.size || {}),
            width: nextWidth,
            height:
              typeof startHeight === "number"
                ? nextHeight
                : blockSnapshot.size?.height,
          },
        });

        // schedule measurement for the resized block
        scheduleMeasureForIds([blockSnapshot.id]);
      }

      // --- SINGLE BLOCK CROP (replacement) ---
      if (
        type === "crop" &&
        blockSnapshot.type === "image" &&
        hasNumericSize(blockSnapshot)
      ) {
        const handle = interaction.handle;
        if (!handle) return;

        const cropSnapshot = getCropValues(blockSnapshot.crop); // left/right/top/bottom in 0..100
        const { width, height } = blockSnapshot.size;

        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        const nextCrop = { ...cropSnapshot };

        // Config: how close to the edges you want to allow (visible area min)
        const MIN_VISIBLE_PERCENT = 1; // visible width/height can be as low as 1% (tweak if too extreme)
        const MIN_EDGE = 0; // edges may go down to 0%
        const MAX_EDGE = 100; // edges may go up to 100%

        // helper to clamp 0..100
        const clamp100 = (v) => Math.min(Math.max(v, MIN_EDGE), MAX_EDGE);

        // Convert delta -> percent of block dimension
        const dxPercent = width > 0 ? (deltaX / width) * 100 : 0;
        const dyPercent = height > 0 ? (deltaY / height) * 100 : 0;

        if (handle === "left") {
          // move left crop inward when dragging right (dxPercent positive)
          nextCrop.left = clamp100(cropSnapshot.left + dxPercent);
          // enforce minimum visible width: left + right <= 100 - MIN_VISIBLE_PERCENT
          nextCrop.left = Math.min(
            nextCrop.left,
            100 - cropSnapshot.right - MIN_VISIBLE_PERCENT
          );
        }

        if (handle === "right") {
          // moving right handle: dragging right should decrease right crop, dragging left increases it
          // original code used (cropSnapshot.right - dxPercent) — we mirror that but clamp clearly
          nextCrop.right = clamp100(cropSnapshot.right - dxPercent);
          nextCrop.right = Math.min(
            nextCrop.right,
            100 - cropSnapshot.left - MIN_VISIBLE_PERCENT
          );
        }

        if (handle === "top") {
          nextCrop.top = clamp100(cropSnapshot.top + dyPercent);
          nextCrop.top = Math.min(
            nextCrop.top,
            100 - cropSnapshot.bottom - MIN_VISIBLE_PERCENT
          );
        }

        if (handle === "bottom") {
          nextCrop.bottom = clamp100(cropSnapshot.bottom - dyPercent);
          nextCrop.bottom = Math.min(
            nextCrop.bottom,
            100 - cropSnapshot.top - MIN_VISIBLE_PERCENT
          );
        }

        // Final safety: make sure no edge exceeds MAX_EDGE and visible span >= MIN_VISIBLE_PERCENT
        nextCrop.left = clamp100(nextCrop.left);
        nextCrop.right = clamp100(nextCrop.right);
        nextCrop.top = clamp100(nextCrop.top);
        nextCrop.bottom = clamp100(nextCrop.bottom);

        // If numerical drift makes visible < MIN_VISIBLE_PERCENT, nudge the moving edge back.
        const visibleH = 100 - (nextCrop.left + nextCrop.right);
        if (visibleH < MIN_VISIBLE_PERCENT) {
          // nudge the edge that changed this move (prefer to adjust the handle side)
          if (handle === "left") {
            nextCrop.left = 100 - nextCrop.right - MIN_VISIBLE_PERCENT;
          } else if (handle === "right") {
            nextCrop.right = 100 - nextCrop.left - MIN_VISIBLE_PERCENT;
          } else {
            // fallback: scale both
            const excess = MIN_VISIBLE_PERCENT - visibleH;
            // distribute small correction
            nextCrop.left = clamp100(nextCrop.left - excess / 2);
            nextCrop.right = clamp100(nextCrop.right - excess / 2);
          }
        }

        const visibleV = 100 - (nextCrop.top + nextCrop.bottom);
        if (visibleV < MIN_VISIBLE_PERCENT) {
          if (handle === "top") {
            nextCrop.top = 100 - nextCrop.bottom - MIN_VISIBLE_PERCENT;
          } else if (handle === "bottom") {
            nextCrop.bottom = 100 - nextCrop.top - MIN_VISIBLE_PERCENT;
          } else {
            const excess = MIN_VISIBLE_PERCENT - visibleV;
            nextCrop.top = clamp100(nextCrop.top - excess / 2);
            nextCrop.bottom = clamp100(nextCrop.bottom - excess / 2);
          }
        }

        // commit live
        store.updateBlock(blockSnapshot.id, { crop: nextCrop });

        // keep overlay in sync
        scheduleMeasureForIds([blockSnapshot.id]);
      }

      // --- SINGLE BLOCK ROTATE ---
      if (type === "rotate" && hasNumericSize(blockSnapshot)) {
        const { center, startAngle, initialRotation } = interaction;
        const currentAngle = Math.atan2(
          event.clientY - center.y,
          event.clientX - center.x
        );
        const deltaAngle = currentAngle - startAngle;
        const degrees = ((deltaAngle * 180) / Math.PI + initialRotation) % 360;

        store.updateBlock(blockSnapshot.id, {
          rotation: Number.isFinite(degrees) ? degrees : 0,
        });

        // schedule measurement for rotation
        scheduleMeasureForIds([blockSnapshot.id]);
      }
    },
    // dependencies: include anything used inside (store, refs, helpers)
    [
      store,
      canvasRef,
      workspaceRef,
      isGroupId,
      getCropValues,
      clampCropValue,
      hasNumericSize,
      activePageId,
      measurementRAFRef,
    ]
  );

  // create single stable function objects once (same identity)
  const onDocPointerMove = useRef((event) => {
    // call latest handler if present
    if (handlePointerMoveRef.current) handlePointerMoveRef.current(event);
  }).current;

  const onDocPointerUp = useRef((event) => {
    if (endInteractionRef.current) endInteractionRef.current(event);
  }).current;

  const endInteraction = useCallback(() => {
    // remove listeners first
    document.removeEventListener("pointermove", onDocPointerMove);
    document.removeEventListener("pointerup", onDocPointerUp);

    const interaction = interactionRef.current;
    if (!interaction) {
      interactionRef.current = null;
      return;
    }

    const { type, blockId, blockSnapshot, groupSnapshot, childSnapshots } =
      interaction;

    try {
      // ---------- GROUP finalization (atomic) ----------
      if (isGroupId(blockId)) {
        // groupBefore: prefer groupSnapshot captured in beginInteraction
        const groupBefore =
          groupSnapshot ??
          interaction.blockSnapshot ??
          store.getGroupById?.(blockId) ??
          null;
        // groupAfter: current group stored in the store
        const groupAfter = store.getGroupById?.(blockId) ?? null;

        // build child before map from captured snapshots (interaction.childSnapshots)
        const childBefore = {};
        (childSnapshots || []).forEach((s) => {
          childBefore[s.id] = {
            position: s.position ? { ...s.position } : undefined,
            rotation:
              typeof s.rotation !== "undefined" ? s.rotation : undefined,
            size: s.size ? { ...s.size } : undefined,
            fontSize:
              typeof s.fontSize !== "undefined" ? s.fontSize : undefined,
          };
        });

        // build child after map by reading current store blocks (use groupAfter.childIds if available)
        const childIds =
          groupAfter?.childIds &&
          Array.isArray(groupAfter.childIds) &&
          groupAfter.childIds.length
            ? groupAfter.childIds
            : interaction.groupBlockIds || Object.keys(childBefore);

        const childAfter = {};
        childIds.forEach((cid) => {
          const b = store.getBlockById(cid);
          if (!b) return;
          childAfter[cid] = {
            position: b.position ? { ...b.position } : undefined,
            rotation:
              typeof b.rotation !== "undefined" ? b.rotation : undefined,
            size: b.size ? { ...b.size } : undefined,
            fontSize:
              typeof b.fontSize !== "undefined" ? b.fontSize : undefined,
          };
        });

        // Only apply if something actually changed
        const beforeStr = JSON.stringify({
          group: groupBefore,
          children: childBefore,
        });
        const afterStr = JSON.stringify({
          group: groupAfter,
          children: childAfter,
        });
        if (beforeStr !== afterStr) {
          store.applyCommand(
            GroupTransformCommand(
              blockId,
              groupBefore,
              groupAfter,
              childBefore,
              childAfter
            )
          );
        }

        interactionRef.current = null;
        return;
      }

      // ---------- SINGLE BLOCK finalization ----------
      if (!blockSnapshot) {
        interactionRef.current = null;
        return;
      }

      const blockIdFinal = blockSnapshot.id;
      const current = store.getBlockById(blockIdFinal);

      if (type === "move") {
        if (current && blockSnapshot.position) {
          const beforePos = { ...blockSnapshot.position };
          const afterPos = current.position ? { ...current.position } : null;
          if (
            afterPos &&
            (beforePos.x !== afterPos.x || beforePos.y !== afterPos.y)
          ) {
            store.applyCommand(MoveCommand(blockIdFinal, beforePos, afterPos));
          }
        }
      } else if (type === "resize") {
        if (current) {
          const beforeSize = blockSnapshot.size
            ? { ...blockSnapshot.size }
            : null;
          const afterSize = current.size ? { ...current.size } : null;
          const beforePos = blockSnapshot.position
            ? { ...blockSnapshot.position }
            : null;
          const afterPos = current.position ? { ...current.position } : null;
          const beforeFont =
            typeof blockSnapshot.fontSize !== "undefined"
              ? blockSnapshot.fontSize
              : null;
          const afterFont =
            typeof current.fontSize !== "undefined" ? current.fontSize : null;

          // Only push if something changed
          if (
            JSON.stringify(beforeSize) !== JSON.stringify(afterSize) ||
            JSON.stringify(beforePos) !== JSON.stringify(afterPos) ||
            beforeFont !== afterFont
          ) {
            store.applyCommand(
              ResizeCommand({
                blockId: blockIdFinal,
                oldSize: beforeSize,
                newSize: afterSize,
                oldPos: beforePos,
                newPos: afterPos,
                oldFontSize: beforeFont,
                newFontSize: afterFont,
              })
            );
          }
        }
      } else if (type === "rotate") {
        if (current) {
          const beforeRot =
            typeof blockSnapshot.rotation !== "undefined"
              ? blockSnapshot.rotation
              : 0;
          const afterRot =
            typeof current.rotation !== "undefined" ? current.rotation : 0;
          if (beforeRot !== afterRot) {
            store.applyCommand(
              RotateCommand({
                blockId: blockIdFinal,
                oldRotation: beforeRot,
                newRotation: afterRot,
              })
            );
          }
        }
      } else if (type === "crop") {
        if (current) {
          const beforeCrop = blockSnapshot.crop
            ? { ...blockSnapshot.crop }
            : {};
          const afterCrop = current.crop ? { ...current.crop } : {};
          if (JSON.stringify(beforeCrop) !== JSON.stringify(afterCrop)) {
            store.applyCommand(
              CropCommand(blockIdFinal, beforeCrop, afterCrop)
            );
          }
        }
      }
    } catch (err) {
      console.error("endInteraction: finalize failed", err);
    } finally {
      interactionRef.current = null;
    }
  }, [
    handlePointerMove,
    store,
    MoveCommand,
    ResizeCommand,
    RotateCommand,
    CropCommand,
    GroupTransformCommand,
  ]);

  const handleChangeCanvasBackground = useCallback((color) => {
    setCanvasBackground(color);
  }, []);

  const toggleTextFormatForSelection = useCallback(
    (patchFn) => {
      if (typeof patchFn !== "function") return;

      // Resolve selection (prefer selectedIds, fallback to activeId)
      const selIds =
        selectedIds && selectedIds.length
          ? selectedIds.slice()
          : activeId
          ? [activeId]
          : [];

      if (selIds.length === 0) return;

      // If single selection is a group, expand to group's child ids
      let targetIds = selIds;
      if (selIds.length === 1 && isGroupId(selIds[0])) {
        const g = store.getGroupById?.(selIds[0]);
        if (!g) return;
        targetIds =
          Array.isArray(g.childIds) && g.childIds.length
            ? g.childIds.slice()
            : Array.isArray(g.blockIds) && g.blockIds.length
            ? g.blockIds.slice()
            : [];
      }

      // Filter to existing text blocks
      const textIds = targetIds.filter((id) => {
        const b = store.getBlockById?.(id);
        return b && b.type === "text";
      });

      if (textIds.length === 0) return;

      // Build old/new patches per block
      const oldMap = {}; // id -> oldPatch
      const newMap = {}; // id -> newPatch

      textIds.forEach((id) => {
        const b = store.getBlockById(id);
        if (!b) return;

        // Clone minimal block for patchFn to avoid mutating store object
        const before = JSON.parse(JSON.stringify(b));
        const after = patchFn(JSON.parse(JSON.stringify(b))) || {};

        // compute shallow diff: keys that changed or newly added/removed
        const diffNew = {};
        const diffOld = {};

        // consider keys in union of before and after
        const keys = Array.from(
          new Set([...Object.keys(before), ...Object.keys(after)])
        );
        keys.forEach((k) => {
          const valBefore = before[k];
          const valAfter = after[k];

          // simple deep-equality for objects/arrays via JSON stringify (sufficient for our POJOs)
          const same = (() => {
            if (typeof valBefore === "object" || typeof valAfter === "object") {
              try {
                return JSON.stringify(valBefore) === JSON.stringify(valAfter);
              } catch {
                return valBefore === valAfter;
              }
            }
            return valBefore === valAfter;
          })();

          if (!same) {
            diffNew[k] = valAfter;
            diffOld[k] = typeof valBefore === "undefined" ? null : valBefore;
          }
        });

        // Only include if there's an actual change
        if (Object.keys(diffNew).length > 0) {
          oldMap[id] = diffOld;
          newMap[id] = diffNew;
        }
      });

      // If nothing changed, bail
      if (Object.keys(newMap).length === 0) return;

      // Apply live updates
      Object.entries(newMap).forEach(([id, patch]) => {
        store.updateBlock(id, patch);
      });

      // Create a single compound command for undo/redo
      const cmd = {
        do(s) {
          Object.entries(newMap).forEach(([id, patch]) =>
            s.updateBlock(id, patch)
          );
        },
        undo(s) {
          Object.entries(oldMap).forEach(([id, patch]) =>
            s.updateBlock(id, patch)
          );
        },
      };

      store.applyCommand(cmd);
    },
    [store, selectedIds, activeId, isGroupId]
  );

  // Toggle bold
  const handleToggleBold = useCallback(() => {
    toggleTextFormatForSelection((b) => ({ ...b, bold: !b.bold }));
  }, [toggleTextFormatForSelection]);

  // Toggle italic
  const handleToggleItalic = useCallback(() => {
    toggleTextFormatForSelection((b) => ({ ...b, italic: !b.italic }));
  }, [toggleTextFormatForSelection]);

  // Toggle underline
  const handleToggleUnderline = useCallback(() => {
    toggleTextFormatForSelection((b) => ({ ...b, underline: !b.underline }));
  }, [toggleTextFormatForSelection]);

  // Toggle strikethrough
  const handleToggleStrike = useCallback(() => {
    toggleTextFormatForSelection((b) => ({ ...b, strike: !b.strike }));
  }, [toggleTextFormatForSelection]);

  // FONT SIZE handler — safe replacement
  const handleChangeFontSize = useCallback(
    (size) => {
      if (typeof size === "undefined" || size === null) return;

      // determine selection
      const selIds =
        selectedIds && selectedIds.length
          ? selectedIds.slice()
          : activeId
          ? [activeId]
          : [];

      if (selIds.length === 0) return;

      // expand group -> text children if single selection is a group
      let targetIds = selIds;
      if (selIds.length === 1 && isGroupId(selIds[0])) {
        const g = store.getGroupById?.(selIds[0]);
        if (!g) return;
        targetIds = (g.childIds || []).slice();
      }

      // filter to existing text blocks
      const textIds = targetIds.filter((id) => {
        const b = store.getBlockById(id);
        return b && b.type === "text";
      });

      if (textIds.length === 0) return;

      // build old/new maps
      const oldMap = {};
      const newMap = {};
      textIds.forEach((id) => {
        const b = store.getBlockById(id);
        oldMap[id] = {
          fontSize: typeof b.fontSize !== "undefined" ? b.fontSize : null,
        };
        newMap[id] = { fontSize: size };
      });

      // Apply live update
      textIds.forEach((id) => store.updateBlock(id, { fontSize: size }));

      // Create a single compound command (do/undo)
      const cmd = {
        do(s) {
          Object.entries(newMap).forEach(([id, patch]) =>
            s.updateBlock(id, patch)
          );
        },
        undo(s) {
          Object.entries(oldMap).forEach(([id, patch]) =>
            s.updateBlock(id, patch)
          );
        },
      };

      store.applyCommand(cmd);
    },
    [store, selectedIds, activeId, isGroupId]
  );

  // ---------- Text color handler (for selected text blocks) ----------
  const handleChangeTextColor = useCallback(
    (color) => {
      if (!color) return;

      // determine selection
      const selIds =
        selectedIds && selectedIds.length
          ? selectedIds.slice()
          : activeId
          ? [activeId]
          : [];

      if (selIds.length === 0) return;

      // if a single selection and it's a group, expand to group's text children
      let targetIds = selIds;
      if (selIds.length === 1 && isGroupId(selIds[0])) {
        const g = store.getGroupById?.(selIds[0]);
        if (!g) return;
        targetIds = (g.childIds || []).slice();
      }

      // filter to existing text blocks
      const textIds = targetIds.filter((id) => {
        const b = store.getBlockById(id);
        return b && b.type === "text";
      });

      if (textIds.length === 0) return;

      // build old/new maps
      const oldMap = {};
      const newMap = {};
      textIds.forEach((id) => {
        const b = store.getBlockById(id);
        oldMap[id] = { color: typeof b.color !== "undefined" ? b.color : null };
        newMap[id] = { color };
      });

      // Apply live update
      textIds.forEach((id) => store.updateBlock(id, { color }));

      // Compound command for undo/redo
      const cmd = {
        do(s) {
          Object.entries(newMap).forEach(([id, patch]) =>
            s.updateBlock(id, patch)
          );
        },
        undo(s) {
          Object.entries(oldMap).forEach(([id, patch]) =>
            s.updateBlock(id, patch)
          );
        },
      };

      store.applyCommand(cmd);
    },
    [store, selectedIds, activeId, isGroupId]
  );

  const createTextBlock = useCallback(() => {
    const genId = (prefix = "b") =>
      `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const defaultX = (canvasRect?.width ?? 800) / 2 - 120;
    const defaultY = (canvasRect?.height ?? 600) / 2 - 24;

    const newId = genId("b");
    const highestZ =
      (store.blocks || []).reduce((m, b) => Math.max(m, b.zIndex ?? 0), 0) || 0;

    const newBlock = {
      id: newId,
      type: "text",
      variant: "normal",
      fontFamily: "Roboto, system-ui, -apple-system",
      content: "New text",
      position: { x: defaultX, y: defaultY },
      size: { width: 240, height: 48 },
      rotation: 0,
      fontSize: 16,
      color: "#111827",
      zIndex: highestZ + 1,
      locked: false,
    };

    // Apply add-block as an undoable command
    store.applyCommand(
      AddBlockCommand({ pageId: store.activePageId, createdBlock: newBlock })
    );

    // update selection and active id locally
    setSelectedIds([newId]);
    setActiveId(newId);

    // optionally open text edit / focus
    // setEditingBlockId(newId);
  }, [canvasRef, store, setSelectedIds, setActiveId]);

  const currentBackground = (() => {
    if (!selectedIds || selectedIds.length === 0) return "";
    if (selectedIds.length === 1 && isGroupId(selectedIds[0])) {
      const g = getGroupById(selectedIds[0]);
      if (!g) return "";
      return (
        g.background ??
        (g.blockIds?.[0] && getBlockById(g.blockIds[0])?.background) ??
        ""
      );
    }
    // if single block selected
    if (selectedIds.length === 1) {
      return getBlockById(selectedIds[0])?.background ?? "";
    }
    // mixed selection or many -> empty
    return "";
  })();

  // -------------------------
  // BEGIN interaction (starts pointerdrag) — supports groups for move
  // -------------------------
  const beginInteraction = useCallback(
    (event, type, blockId, options = {}) => {
      event.preventDefault();
      event.stopPropagation();

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      // If group
      if (isGroupId(blockId)) {
        const g = store.getGroupById?.(blockId);
        if (!g) return;

        // normalize child ids (support both childIds and blockIds)
        const groupBlockIds = Array.isArray(g.childIds)
          ? [...g.childIds]
          : Array.isArray(g.blockIds)
          ? [...g.blockIds]
          : [];

        // child snapshots from store
        const childSnapshots = groupBlockIds
          .map((bid) => {
            const b = store.getBlockById(bid);
            if (!b) return null;
            return {
              id: b.id,
              position: b.position ? { ...b.position } : { x: 0, y: 0 },
              size: b.size ? { ...b.size } : { width: 0, height: 0 },
              rotation: typeof b.rotation !== "undefined" ? b.rotation : 0,
              fontSize:
                typeof b.fontSize !== "undefined" ? b.fontSize : undefined,
            };
          })
          .filter(Boolean);

        // blockOffsets may be stored on group; otherwise compute from block positions
        const storedOffsets =
          g.blockOffsets && typeof g.blockOffsets === "object"
            ? { ...g.blockOffsets }
            : {};

        const computedOffsets = {};
        if (!Object.keys(storedOffsets).length) {
          const groupPos = g.position || { x: 0, y: 0 };
          groupBlockIds.forEach((bid) => {
            const b = store.getBlockById(bid);
            if (!b) return;
            computedOffsets[bid] = {
              x: (b.position?.x ?? 0) - (groupPos.x ?? 0),
              y: (b.position?.y ?? 0) - (groupPos.y ?? 0),
            };
          });
        }

        const blockOffsets =
          Object.keys(storedOffsets).length > 0
            ? storedOffsets
            : computedOffsets;

        // deep clone group snapshot using JSON to avoid undefined deepClone helper
        const clonedGroup = JSON.parse(JSON.stringify(g));

        const payload = {
          type,
          blockId,
          startX: event.clientX,
          startY: event.clientY,
          canvasRect,
          // provide both blockSnapshot and groupSnapshot (downstream code may read either)
          blockSnapshot: clonedGroup,
          groupSnapshot: clonedGroup,
          groupSnapshotPosition: clonedGroup.position
            ? { ...clonedGroup.position }
            : { x: 0, y: 0 },
          groupBlockIds,
          childSnapshots,
          blockOffsets,
          ...options,
        };

        // rotation helper for group
        if (type === "rotate") {
          const blockSnapshot = payload.groupSnapshot;
          const blockWidth = blockSnapshot.size?.width ?? 0;
          const blockHeight = blockSnapshot.size?.height ?? 0;

          const centerX =
            canvasRect.left + (blockSnapshot.position?.x ?? 0) + blockWidth / 2;
          const centerY =
            canvasRect.top + (blockSnapshot.position?.y ?? 0) + blockHeight / 2;

          payload.center = { x: centerX, y: centerY };
          payload.startAngle = Math.atan2(
            event.clientY - centerY,
            event.clientX - centerX
          );
          payload.initialRotation = blockSnapshot.rotation ?? 0;
        }

        interactionRef.current = payload;
        setActiveId(blockId);
        document.addEventListener("pointermove", onDocPointerMove);
        document.addEventListener("pointerup", onDocPointerUp);
        return;
      }

      // --- single block ---
      const b = store.getBlockById(blockId);
      if (!b) return;

      // if locked, just focus/select and bail
      if (b.locked) {
        setActiveId(blockId);
        setEditingBlockId(null);
        return;
      }

      setActiveId(blockId);
      setEditingBlockId(null);

      const payload = {
        type,
        blockId,
        startX: event.clientX,
        startY: event.clientY,
        canvasRect,
        blockSnapshot: {
          id: b.id,
          position: b.position ? { ...b.position } : { x: 0, y: 0 },
          size: b.size ? { ...b.size } : { width: 0, height: 0 },
          rotation: typeof b.rotation !== "undefined" ? b.rotation : 0,
          fontSize: typeof b.fontSize !== "undefined" ? b.fontSize : undefined,
          // keep other useful props if needed
          type: b.type,
          crop: b.crop ? { ...b.crop } : undefined,
        },
        ...options,
      };

      // rotation helper for single block
      if (type === "rotate" && hasNumericSize(b)) {
        const blockWidth = b.size.width;
        const blockHeight = b.size.height ?? 0;

        const centerX = canvasRect.left + (b.position?.x ?? 0) + blockWidth / 2;
        const centerY = canvasRect.top + (b.position?.y ?? 0) + blockHeight / 2;

        payload.center = { x: centerX, y: centerY };
        payload.startAngle = Math.atan2(
          event.clientY - centerY,
          event.clientX - centerX
        );
        payload.initialRotation = b.rotation ?? 0;
      }

      interactionRef.current = payload;
      document.addEventListener("pointermove", onDocPointerMove);
      document.addEventListener("pointerup", onDocPointerUp);
    },
    [
      store,
      isGroupId,
      handlePointerMove,
      endInteraction,
      setActiveId,
      setEditingBlockId,
      hasNumericSize,
    ]
  );

  // -------------------------
  // Selection and multi-select: Ctrl/Cmd/Shift toggles membership
  // -------------------------
  const handleBlockPointerDown = useCallback(
    (event, block) => {
      // If we are already editing this text block, don't start selection/move
      if (block.type === "text" && editingBlockId === block.id) {
        event.stopPropagation();
        return;
      }

      // Read authoritative block from store (in case local prop is stale)
      const freshBlock = store.getBlockById
        ? store.getBlockById(block.id)
        : block;
      if (!freshBlock) {
        // fallback to passed block if store doesn't have it for some reason
        // but still continue with same logic
      }

      // multi-select modifier
      const multi = event.shiftKey || event.metaKey || event.ctrlKey;

      // If block is inside a group, target the group id; otherwise use the block id
      const targetId =
        freshBlock && freshBlock.groupId
          ? freshBlock.groupId
          : block.groupId ?? block.id;

      // If block (or the block object clicked) is locked, just toggle/select without starting drag
      const locked = freshBlock?.locked ?? block.locked;
      if (locked) {
        event.stopPropagation();
        if (multi) {
          setSelectedIds((prev) =>
            prev.includes(targetId)
              ? prev.filter((i) => i !== targetId)
              : [...prev, targetId]
          );
        } else {
          setSelectedIds([targetId]);
          setActiveId(targetId);
          setEditingBlockId(null);
        }
        return;
      }

      // Multi-select toggle behaviour (do not start dragging)
      if (multi) {
        event.stopPropagation();
        setSelectedIds((prev) =>
          prev.includes(targetId)
            ? prev.filter((i) => i !== targetId)
            : [...prev, targetId]
        );
        setActiveId(targetId);
        setEditingBlockId(null);
        return;
      }

      // Single select + begin move
      setSelectedIds([targetId]);
      beginInteraction(event, "move", targetId);
    },
    [
      store,
      beginInteraction,
      editingBlockId,
      setSelectedIds,
      setActiveId,
      setEditingBlockId,
    ]
  );

  // -------------------------
  // Delete and duplicate: extend to groups
  // -------------------------
  const handleDeleteActive = useCallback(() => {
    if (!activeId) return;

    // If activeId is group
    if (isGroupId(activeId)) {
      const group = store.getGroupById?.(activeId);
      if (!group) return;

      // Capture full snapshots of the group and its blocks so we can undo exactly
      const groupSnapshot = JSON.parse(JSON.stringify(group));
      const page =
        store.findPageContainingBlock?.(group.childIds?.[0]) ||
        store.activePage;
      const blockSnapshots = [];
      // capture each block and its index within the page
      (group.childIds || []).forEach((bid) => {
        const b = store.getBlockById(bid);
        if (!b) return;
        const idx = page ? page.blocks.findIndex((blk) => blk.id === bid) : -1;
        blockSnapshots.push({
          block: JSON.parse(JSON.stringify(b)),
          index: idx,
        });
      });

      // create a single compound command (do/undo) for group deletion
      const cmd = {
        do(s) {
          // remove all blocks (in descending index order to keep indices consistent)
          const sorted = blockSnapshots
            .slice()
            .sort((a, b) => (b.index ?? -1) - (a.index ?? -1));
          sorted.forEach((bs) => {
            if (bs.block && bs.block.id) {
              const pageContaining =
                s.findPageContainingBlock?.(bs.block.id) || s.activePage;
              if (pageContaining) {
                pageContaining.blocks = (pageContaining.blocks || []).filter(
                  (blk) => blk.id !== bs.block.id
                );
              }
            }
          });

          // remove group meta
          if (typeof s.removeGroup === "function") {
            s.removeGroup(activeId);
          } else {
            // fallback: remove from s.groups
            s.groups = (s.groups || []).filter((g) => g.id !== activeId);
          }
        },
        undo(s) {
          // restore blocks at their original indices
          const pid = page?.id ?? s.activePageId;
          const targetPage =
            s.project.pages.find((p) => p.id === pid) || s.activePage;
          if (!targetPage) return;

          const blocksCopy = targetPage.blocks ? targetPage.blocks.slice() : [];
          // insert each block at recorded index (if valid) else push
          blockSnapshots.forEach((bs) => {
            if (!bs.block) return;
            const idx =
              typeof bs.index === "number" &&
              bs.index >= 0 &&
              bs.index <= blocksCopy.length
                ? bs.index
                : blocksCopy.length;
            // avoid duplicates
            if (!blocksCopy.some((b) => b.id === bs.block.id)) {
              blocksCopy.splice(idx, 0, bs.block);
            }
          });
          targetPage.blocks = blocksCopy;

          // restore group meta
          if (typeof s.addGroup === "function") {
            s.addGroup(groupSnapshot);
          } else {
            s.groups = [...(s.groups || []), groupSnapshot];
          }
        },
      };

      // apply compound command
      store.applyCommand(cmd);

      // clear selection / UI state
      setSelectedIds([]);
      setActiveId(null);
      setEditingBlockId(null);
      setIsPositionPanelOpen(false);

      return;
    }

    // Single block delete (undoable via existing command)
    // prefer using DeleteBlockCommand factory to keep undo behavior consistent
    const toDeleteId = activeId;
    store.applyCommand(DeleteBlockCommand(toDeleteId));

    // clear UI selection state
    setActiveId(null);
    setEditingBlockId(null);
    setIsPositionPanelOpen(false);
  }, [
    activeId,
    store,
    setSelectedIds,
    setActiveId,
    setEditingBlockId,
    setIsPositionPanelOpen,
  ]);

  const handleToggleLock = useCallback(
    (blockId) => {
      const b = store.getBlockById?.(blockId);
      if (!b) {
        // Nothing to toggle
        return;
      }

      const oldLocked = !!b.locked;
      const newLocked = !oldLocked;

      // apply undoable command
      store.applyCommand(LockUnlockCommand(blockId, oldLocked, newLocked));
    },
    [store]
  );

  // Duplicate single block or group
  const handleDuplicateBlock = useCallback(
    (id) => {
      if (!id) return;

      // DUPLICATE GROUP
      if (isGroupId(id)) {
        const group = store.getGroupById?.(id);
        if (!group) return;

        // normalize child ids key (support either childIds or blockIds)
        const originalChildIds = getGroupBlockIds(group);

        if (originalChildIds.length === 0) return;

        const offset = 16;
        const newGroupId = `g-${Date.now()}-${Math.floor(
          Math.random() * 100000
        )}`;

        // Build copies and new offsets
        const copies = [];
        const newBlockIds = [];
        const newBlockOffsets = {};

        // determine active page to insert into
        const page =
          store.findPageContainingBlock?.(originalChildIds[0]) ||
          store.activePage;
        const pageId = page?.id ?? store.activePageId;

        // compute current max zIndex on that page
        const pageBlocks = page?.blocks ?? [];
        const maxZ = pageBlocks.reduce((m, b) => Math.max(m, b.zIndex ?? 0), 0);

        originalChildIds.forEach((origId, idx) => {
          const orig = store.getBlockById(origId);
          if (!orig) return;

          const newId = `${orig.id}-${Date.now()}-${Math.floor(
            Math.random() * 100000
          )}`;
          newBlockIds.push(newId);

          // copy offset if group has offsets keyed by original id
          const origOffsets = group.blockOffsets ?? group.blockOffsets ?? {};
          if (origOffsets && origOffsets[origId]) {
            newBlockOffsets[newId] = { ...origOffsets[origId] };
          }

          const copy = JSON.parse(JSON.stringify(orig));
          copy.id = newId;
          // assign to new group
          // our store uses childIds for group membership, but blocks keep groupId field
          copy.groupId = newGroupId;
          // offset position slightly so duplicates don't overlap exactly
          copy.position = {
            x: (orig.position?.x ?? 0) + offset,
            y: (orig.position?.y ?? 0) + offset,
          };
          copy.zIndex = (orig.zIndex ?? maxZ) + 1 + idx; // keep stacking order
          copies.push(copy);
        });

        // create new group meta based on original (deep-cloned)
        const groupMeta = JSON.parse(JSON.stringify(group));
        groupMeta.id = newGroupId;
        // childIds key is used by store; support both
        if ("childIds" in groupMeta) groupMeta.childIds = newBlockIds;
        if ("blockIds" in groupMeta) groupMeta.blockIds = newBlockIds;
        groupMeta.blockOffsets = newBlockOffsets;
        groupMeta.position = {
          x: (group.position?.x ?? 0) + offset,
          y: (group.position?.y ?? 0) + offset,
        };

        // Compound command: add all blocks and add group; undo removes them.
        const cmd = {
          do(s) {
            // append copies to the target page
            const p =
              s.project.pages.find((pg) => pg.id === pageId) || s.activePage;
            if (!p) return;
            p.blocks = [
              ...(p.blocks || []),
              ...JSON.parse(JSON.stringify(copies)),
            ];

            // add group meta to store
            if (typeof s.addGroup === "function") {
              // normalize to store's preferred childIds field
              const gm = { ...groupMeta };
              if (!gm.childIds && gm.blockIds) gm.childIds = gm.blockIds;
              s.addGroup(gm);
            } else {
              s.groups = [...(s.groups || []), groupMeta];
            }
          },
          undo(s) {
            // remove the created blocks
            const p =
              s.project.pages.find((pg) => pg.id === pageId) || s.activePage;
            if (!p) return;
            p.blocks = (p.blocks || []).filter(
              (b) => !newBlockIds.includes(b.id)
            );

            // remove group meta
            if (typeof s.removeGroup === "function") {
              s.removeGroup(newGroupId);
            } else {
              s.groups = (s.groups || []).filter((g) => g.id !== newGroupId);
            }
          },
        };

        store.applyCommand(cmd);

        // select new group
        setSelectedIds([newGroupId]);
        setActiveId(newGroupId);
        return;
      }

      // DUPLICATE SINGLE BLOCK (undoable using DuplicateCommand with createdBlock)
      const orig = store.getBlockById(id);
      if (!orig) return;

      // find page containing the block
      const page = store.findPageContainingBlock?.(id) || store.activePage;
      const pageId = page?.id ?? store.activePageId;

      const offset = 16;
      const newId = `${id}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const maxZ = (page?.blocks ?? []).reduce(
        (m, b) => Math.max(m, b.zIndex ?? 0),
        0
      );

      const newBlock = JSON.parse(JSON.stringify(orig));
      newBlock.id = newId;
      newBlock.locked = false;
      newBlock.position = {
        x: (orig.position?.x ?? 0) + offset,
        y: (orig.position?.y ?? 0) + offset,
      };
      newBlock.zIndex = (orig.zIndex ?? maxZ) + 1;

      // use DuplicateCommand factory with createdBlock to make this undoable as one command
      store.applyCommand(DuplicateCommand({ pageId, createdBlock: newBlock }));

      // select new block
      setSelectedIds([newId]);
      setActiveId(newId);
    },
    [store, isGroupId, setSelectedIds, setActiveId]
  );

  // -------------------------
  // Selection helpers
  // -------------------------
  // select a layer (UI selection only)
  const handleSelectLayer = useCallback(
    (id) => {
      setActiveId(id);
      setEditingBlockId(null);
      setSelectedIds([id]);
    },
    [setActiveId, setEditingBlockId, setSelectedIds]
  );

  // cycle text align
  const handleCycleTextAlign = useCallback(() => {
    if (!activeId) return;

    const b = store.getBlockById?.(activeId);
    if (!b || b.type !== "text") return;

    const current = b.textAlign || "center";
    const idx = ALIGN_ORDER.indexOf(current);
    const next = ALIGN_ORDER[(idx + 1) % ALIGN_ORDER.length];

    // no-op guard
    if (next === current) return;

    // live update for immediate UI feedback
    store.updateBlock(activeId, { textAlign: next });

    // push undoable command (oldPatch / newPatch)
    const oldPatch = { textAlign: current };
    const newPatch = { textAlign: next };
    store.applyCommand(TextChangeCommand(activeId, oldPatch, newPatch));
  }, [activeId, store]);

  // cycle list type
  const handleCycleListType = useCallback(() => {
    if (!activeId) return;

    const b = store.getBlockById?.(activeId);
    if (!b || b.type !== "text") return;

    const current = b.listType || "normal";
    const idx = LIST_ORDER.indexOf(current);
    const next = LIST_ORDER[(idx + 1) % LIST_ORDER.length];

    if (next === current) return;

    // live update
    store.updateBlock(activeId, { listType: next });

    // push undoable command
    const oldPatch = { listType: current };
    const newPatch = { listType: next };
    store.applyCommand(TextChangeCommand(activeId, oldPatch, newPatch));
  }, [activeId, store]);

  // -------------------------
  // Grouping: create / ungroup
  // -------------------------
  const computeGroupBBox = useCallback(
    (blockIds) => {
      if (!blockIds || blockIds.length === 0) return null;

      // 1️⃣ Prefer DOM rects (accurate even with rotation)
      const rects = blockIds
        .map((id) => store.getBlockRef(store.activePageId, id))
        .filter(Boolean)
        .map((el) => el.getBoundingClientRect());

      if (rects.length > 0) {
        const left = Math.min(...rects.map((r) => r.left));
        const top = Math.min(...rects.map((r) => r.top));
        const right = Math.max(...rects.map((r) => r.right));
        const bottom = Math.max(...rects.map((r) => r.bottom));

        return {
          left,
          top,
          width: right - left,
          height: bottom - top,
          viewport: true, // values are viewport-based
        };
      }

      // 2️⃣ Fallback: use store blocks (canvas-local coords)
      const chosen = blockIds
        .map((id) => store.getBlockById(id))
        .filter(Boolean);

      if (chosen.length === 0) return null;

      const leftPx = Math.min(...chosen.map((b) => b.position.x));
      const topPx = Math.min(...chosen.map((b) => b.position.y));
      const rightPx = Math.max(
        ...chosen.map((b) => b.position.x + (b.size?.width || 0))
      );
      const bottomPx = Math.max(
        ...chosen.map((b) => b.position.y + (b.size?.height || 0))
      );

      return {
        left: leftPx,
        top: topPx,
        width: rightPx - leftPx,
        height: bottomPx - topPx,
        viewport: false, // values are canvas-local
      };
    },
    [store, store.getBlockRef]
  );

  //create group
  const handleCreateGroup = useCallback(() => {
    if (!selectedIds || selectedIds.length < 2) return;

    // only block ids (ignore group ids if present)
    const blockIds = selectedIds.filter((id) => !isGroupId(id));
    if (blockIds.length < 2) return;

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const bbox = computeGroupBBox(blockIds);
    if (!bbox) return;

    // compute group's canvas-local position & size
    const position = { x: 0, y: 0 };
    const size = { width: bbox.width, height: bbox.height };

    if (bbox.viewport && canvasRect) {
      position.x = bbox.left - canvasRect.left;
      position.y = bbox.top - canvasRect.top;
    } else {
      position.x = bbox.left;
      position.y = bbox.top;
    }

    // calculate page / target for z-index decisions
    const page =
      store.findPageContainingBlock?.(blockIds[0]) || store.activePage;
    const pageBlocks = page?.blocks ?? [];

    // capture original z-index map for each child (used by undo and by ungroup)
    const originalZ = {};
    blockIds.forEach((bid) => {
      const b = store.getBlockById(bid);
      originalZ[bid] = typeof b?.zIndex === "number" ? b.zIndex : 0;
    });

    // compute new z indices so this group's children appear on top (contiguous)
    const globalMaxZ =
      pageBlocks.reduce((m, b) => Math.max(m, b.zIndex ?? 0), 0) || 0;
    let nextZ = globalMaxZ + 1;
    const newZMap = {};
    // preserve the original internal stacking order by sorting by original z
    const orderedChildIds = blockIds
      .slice()
      .sort((a, b) => (originalZ[a] ?? 0) - (originalZ[b] ?? 0));
    orderedChildIds.forEach((id) => {
      newZMap[id] = nextZ++;
    });

    const groupId = `g-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const groupMeta = {
      id: groupId,
      blockIds: blockIds.slice(),
      childIds: blockIds.slice(),
      position,
      size,
      rotation: 0,
      blockOffsets: {}, // will compute below
      meta: {
        originalZ, // store original z map for later ungroup restore
      },
    };

    // compute offsets of each block relative to group position (canvas-local)
    const blockOffsets = {};
    blockIds.forEach((bid) => {
      const b = store.getBlockById(bid);
      if (!b) return;
      blockOffsets[bid] = {
        x: (b.position?.x ?? 0) - position.x,
        y: (b.position?.y ?? 0) - position.y,
      };
    });
    groupMeta.blockOffsets = blockOffsets;

    // Build compound command: set zIndices & group meta atomically
    const cmd = {
      do(s) {
        // 1) set each block.groupId and new zIndex
        Object.entries(newZMap).forEach(([bid, z]) => {
          s.updateBlock(bid, { groupId: groupId, zIndex: z });
        });

        // 2) add group meta to the store
        if (typeof s.addGroup === "function") {
          // normalize to childIds preferred by store
          const gm = { ...groupMeta };
          if (!gm.childIds && gm.blockIds) gm.childIds = gm.blockIds;
          s.addGroup(gm);
        } else {
          s.groups = [
            ...(s.groups || []),
            JSON.parse(JSON.stringify(groupMeta)),
          ];
        }
      },
      undo(s) {
        // 1) remove group meta
        if (typeof s.removeGroup === "function") {
          s.removeGroup(groupId);
        } else {
          s.groups = (s.groups || []).filter((g) => g.id !== groupId);
        }

        // 2) restore original zIndex and clear groupId
        Object.entries(originalZ).forEach(([bid, z]) => {
          // only restore if block still exists
          const blk = s.getBlockById?.(bid);
          if (blk) {
            s.updateBlock(bid, { zIndex: z, groupId: undefined });
          }
        });
      },
    };

    store.applyCommand(cmd);

    // update selection to the new group
    setSelectedIds([groupId]);
    setActiveId(groupId);
  }, [
    selectedIds,
    store,
    canvasRef,
    computeGroupBBox,
    setSelectedIds,
    setActiveId,
    isGroupId,
  ]);

  const handleUngroup = useCallback(
    (groupIdArg) => {
      const groupId = groupIdArg || (selectedIds || []).find(isGroupId);
      if (!groupId) return;

      const group = store.getGroupById?.(groupId);
      if (!group) return;

      // derive member ids
      const members =
        Array.isArray(group.childIds) && group.childIds.length
          ? group.childIds.slice()
          : Array.isArray(group.blockIds)
          ? group.blockIds.slice()
          : [];

      // capture whatever we need for undo: group snapshot and current block snapshots
      const groupSnapshot = JSON.parse(JSON.stringify(group));
      const blockSnapshots = members
        .map((bid) => {
          const b = store.getBlockById(bid);
          return b
            ? { id: bid, snapshot: JSON.parse(JSON.stringify(b)) }
            : null;
        })
        .filter(Boolean);

      // try to get originalZ map from group.meta.originalZ (if exists)
      const savedOriginalZ =
        group.meta && typeof group.meta === "object" && group.meta.originalZ
          ? { ...group.meta.originalZ }
          : null;

      const cmd = {
        do(s) {
          // 1) remove group meta
          if (typeof s.removeGroup === "function") {
            s.removeGroup(groupId);
          } else {
            s.groups = (s.groups || []).filter((g) => g.id !== groupId);
          }

          // 2) clear groupId for members and restore z if savedOriginalZ present
          members.forEach((bid) => {
            const blk = s.getBlockById?.(bid);
            if (!blk) return;
            const toPatch = { groupId: undefined };
            if (savedOriginalZ && typeof savedOriginalZ[bid] !== "undefined") {
              toPatch.zIndex = savedOriginalZ[bid];
            }
            s.updateBlock(bid, toPatch);
          });
        },
        undo(s) {
          // restore group meta
          if (typeof s.addGroup === "function") {
            // ensure we add the same snapshot back (childIds normalized)
            const gm = { ...groupSnapshot };
            if (!gm.childIds && gm.blockIds) gm.childIds = gm.blockIds;
            s.addGroup(gm);
          } else {
            s.groups = [
              ...(s.groups || []),
              JSON.parse(JSON.stringify(groupSnapshot)),
            ];
          }

          // restore each block snapshot (zIndex, position, groupId etc.)
          blockSnapshots.forEach((bs) => {
            const snap = bs.snapshot;
            const patch = {};
            if (typeof snap.zIndex !== "undefined") patch.zIndex = snap.zIndex;
            if (typeof snap.groupId !== "undefined")
              patch.groupId = snap.groupId;
            // restore other fields as needed (here we restore z and groupId)
            s.updateBlock(bs.id, patch);
          });
        },
      };

      store.applyCommand(cmd);

      // update selection: select former members (UX)
      if (members.length > 0) {
        setSelectedIds(members);
        setActiveId(members[0]);
      } else {
        setSelectedIds([]);
        setActiveId(null);
      }
    },
    [selectedIds, store, setSelectedIds, setActiveId, isGroupId]
  );

  // -------------------------
  // Arrange / align / keyboard shortcuts
  // -------------------------
  // Keyboard shortcuts: Group (Ctrl/Cmd+G), Ungroup (Ctrl/Cmd+Shift+G), Escape to clear selection
  useEffect(() => {
    const onKeyDown = (e) => {
      // group: Ctrl/Cmd+G, ungroup: Ctrl/Cmd+Shift+G
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) {
          // ungroup: prefer group id from selectedIds, fallback to store
          const gid =
            (selectedIds || []).find(isGroupId) ||
            (() => {
              // fallback: if selection is a child, find its group in store
              const firstSel = (selectedIds || [])[0];
              const b = firstSel ? store.getBlockById?.(firstSel) : null;
              return b?.groupId ?? null;
            })();
          if (gid) handleUngroup(gid);
        } else {
          // group
          handleCreateGroup();
        }
      }

      if (e.key === "Escape") {
        setSelectedIds([]);
        setActiveId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, handleCreateGroup, handleUngroup, store, isGroupId]);

  // Cleanup pointer listeners on unmount or handler change
  useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", onDocPointerMove);
      document.removeEventListener("pointerup", onDocPointerUp);
      if (measurementRAFRef.current)
        cancelAnimationFrame(measurementRAFRef.current);
    };
  }, [onDocPointerMove, onDocPointerUp]);

  // -------------------------
  // Compute layers for PositionPanel
  // -------------------------
  const layers = [
    // blocks that are not part of a group
    ...(store.blocks || []).filter((b) => !b.groupId),
    // groups represented as layer entries
    ...(store.groups || []).map((g) => {
      // compute max zIndex among children (safe fallback 0)
      const maxZ =
        (g.childIds || g.blockIds || [])
          .map((bid) => store.getBlockById?.(bid)?.zIndex ?? 0)
          .reduce((m, z) => Math.max(m, z), 0) || 0;

      return {
        ...g,
        type: "group",
        zIndex: maxZ,
      };
    }),
  ];

  const handleArrange = useCallback(
    (action) => {
      // pick selection (prefer selectedIds, fall back to activeId)
      const targets = (
        selectedIds && selectedIds.length > 0
          ? selectedIds.slice()
          : activeId
          ? [activeId]
          : []
      ).filter(Boolean);
      if (!targets.length) return;

      const page = store.activePage;
      if (!page || !page.blocks) return;

      // order block ids by current zIndex (asc)
      const ordered = (page.blocks || [])
        .slice()
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map((b) => b.id);

      // new ordering (we'll mutate a copy)
      const newOrder = ordered.slice();

      // helper to move id to index
      const moveToIndex = (id, index) => {
        const i = newOrder.indexOf(id);
        if (i === -1) return;
        newOrder.splice(i, 1);
        newOrder.splice(index, 0, id);
      };

      // perform requested action
      if (action === "forward" || action === "backward") {
        // iterate targets in reasonable order:
        // forward: iterate from end->start so multiple targets behave predictably
        // backward: iterate from start->end
        const iter = action === "forward" ? [...targets].reverse() : targets;
        iter.forEach((tid) => {
          const idx = newOrder.indexOf(tid);
          if (idx === -1) return;
          if (action === "forward" && idx < newOrder.length - 1) {
            // swap with next
            const tmp = newOrder[idx + 1];
            newOrder[idx + 1] = tid;
            newOrder[idx] = tmp;
          } else if (action === "backward" && idx > 0) {
            const tmp = newOrder[idx - 1];
            newOrder[idx - 1] = tid;
            newOrder[idx] = tmp;
          }
        });
      } else if (action === "front") {
        // move targets to end (top)
        targets.forEach((tid) => moveToIndex(tid, newOrder.length));
      } else if (action === "back") {
        // move targets to start (bottom) preserving relative order
        // place them in same relative order as targets array
        targets.forEach((tid, i) => moveToIndex(tid, i));
      } else {
        return;
      }

      // Build oldMap and newMap for changed ids (only commit changed z's)
      const oldMap = {};
      const newMap = {};
      // new z index = position index (0..n-1)
      newOrder.forEach((id, idx) => {
        const block = page.blocks.find((b) => b.id === id);
        const oldZ = block?.zIndex ?? idx;
        if (oldMap[id] === undefined) oldMap[id] = oldZ;
        const newZ = idx;
        if (oldZ !== newZ) newMap[id] = newZ;
      });

      // if nothing changed, do nothing
      if (Object.keys(newMap).length === 0) return;

      // apply undoable command (ZIndexCommand is already in your commands)
      store.applyCommand(ZIndexCommand(oldMap, newMap));

      // optional UI housekeeping
      setIsPositionPanelOpen(false);
      // keep selection as-is
    },
    [selectedIds, activeId, store, setIsPositionPanelOpen]
  );

  // --- Align to page handler ---
  const handleAlign = useCallback(
    (dir) => {
      const targets = (
        selectedIds && selectedIds.length > 0
          ? selectedIds.slice()
          : activeId
          ? [activeId]
          : []
      ).filter(Boolean);
      if (!targets.length) return;

      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const canvasRect = canvasEl.getBoundingClientRect();

      const oldPositions = {};
      const newPatches = {};

      targets.forEach((id) => {
        const block =
          store.getBlockById?.(id) ||
          (store.blocks || []).find((b) => b.id === id);
        if (!block) return;

        // determine width/height of block: prefer DOM for accurate clipped/cropped sizes
        let bw = block.size?.width ?? 0;
        let bh = block.size?.height ?? 0;
        const dom = store.getBlockRef?.(store.activePageId, id);
        if (dom && dom.getBoundingClientRect) {
          const r = dom.getBoundingClientRect();
          // r.width/r.height are rendered box sizes; convert to "canvas-local" coords:
          // if your canvas is not scaled, can use r.width/r.height directly.
          bw = r.width;
          bh = r.height;
        } else {
          // If size is stored in px in the block, keep it; if percent etc., this will be approximate.
          if (typeof bw === "string" && bw.endsWith("px"))
            bw = Number(bw.replace("px", "")) || 0;
          if (typeof bh === "string" && bh.endsWith("px"))
            bh = Number(bh.replace("px", "")) || 0;
        }

        // current position
        const oldPos = block.position || { x: 0, y: 0 };
        oldPositions[id] = { ...(oldPos || {}) };

        // compute new x,y relative to canvas top-left
        let nx = oldPos.x ?? 0;
        let ny = oldPos.y ?? 0;

        if (dir === "top") {
          ny = 0;
        } else if (dir === "middle") {
          ny = Math.round((canvasRect.height - bh) / 2);
        } else if (dir === "bottom") {
          ny = Math.round(canvasRect.height - bh);
        } else if (dir === "left") {
          nx = 0;
        } else if (dir === "center") {
          nx = Math.round((canvasRect.width - bw) / 2);
        } else if (dir === "right") {
          nx = Math.round(canvasRect.width - bw);
        } else {
          return;
        }

        newPatches[id] = {
          position: { x: Math.max(0, nx), y: Math.max(0, ny) },
        };
      });

      // prepare undoable command: record oldPositions -> newPatches
      const cmd = {
        do(s) {
          Object.entries(newPatches).forEach(([id, patch]) => {
            s.updateBlock(id, patch);
          });
        },
        undo(s) {
          Object.entries(oldPositions).forEach(([id, pos]) => {
            s.updateBlock(id, { position: pos });
          });
        },
      };

      store.applyCommand(cmd);

      // keep panel open or close as you prefer
      setIsPositionPanelOpen(false);
    },
    [selectedIds, activeId, store, canvasRef, setIsPositionPanelOpen]
  );

  // -------------------------
  // Reorder layers (PositionPanel)
  // -------------------------
  const handleReorderLayers = useCallback(
    (newOrderedIds) => {
      if (!Array.isArray(newOrderedIds) || newOrderedIds.length === 0) return;

      // Build maps of old zIndices for all affected blocks (so undo can restore)
      const oldMap = {};
      (store.blocks || []).forEach((b) => {
        if (b && b.id) oldMap[b.id] = b.zIndex ?? 0;
      });

      // We'll assign z indices from bottom (lowest) to top (highest)
      const reversedIds = [...newOrderedIds].reverse();
      let currentZ = 1;

      // Build newMap for blocks changed, and apply live updates
      const newMap = {}; // blockId => newZ

      reversedIds.forEach((layerId) => {
        if (isGroupId(layerId)) {
          // group: raise all children in internal order
          const group = store.getGroupById?.(layerId);
          if (!group) return;
          const childIds = getGroupBlockIds(group);

          // sort children by prior zIndex so visual stacking inside group stays consistent
          childIds.sort((a, b) => (oldMap[a] ?? 0) - (oldMap[b] ?? 0));

          childIds.forEach((cid) => {
            newMap[cid] = currentZ++;
          });
        } else {
          // single block id
          newMap[layerId] = currentZ++;
        }
      });

      // Apply live updates to store so UI re-renders immediately
      Object.entries(newMap).forEach(([id, z]) => {
        const blk = store.getBlockById?.(id);
        if (blk) {
          store.updateBlock(id, { zIndex: z });
        }
      });

      // Push a single undoable command that can restore old z-indices
      store.applyCommand(ZIndexCommand(oldMap, newMap));
    },
    [store, isGroupId]
  );

  // keep refs up to date with latest callbacks
  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove;
  }, [handlePointerMove]);

  useEffect(() => {
    endInteractionRef.current = endInteraction;
  }, [endInteraction]);

  return (
    <div
      ref={workspaceRef}
      className="flex min-h-screen items-center justify-center bg-[#e7edf7] font-sans text-slate-900"
    >
      {activeBlock && canvasRect && (
        <SelectionOverlay
          block={activeBlock}
          canvasRect={canvasRect}
          activeRect={activeRect}
          canResize={!activeBlock.locked && hasNumericSize(activeBlock)}
          cornerHandles={activeCornerHandles}
          sideHandles={activeSideHandles}
          cropInsets={activeCropInsets}
          beginInteraction={beginInteraction}
          onSelect={(id) => {
            if (typeof id === "string" && id.startsWith("g-")) {
              setSelectedIds([id]);
              setActiveId(id);
            } else {
              setSelectedIds([id]);
              setActiveId(id);
            }
          }}
        />
      )}

      {toolbarCoords && (selectedIds.length > 0 || activeBlock) && (
        <>
          <HelperToolbar
            visible
            x={toolbarCoords.helperX}
            y={toolbarCoords.helperY}
            locked={
              !!(() => {
                // compute locked state for the active block/group (safe read)
                if (!activeId) return false;
                if (isGroupId(activeId)) {
                  const g = store.getGroupById?.(activeId);
                  return !!g?.locked;
                }
                const b = store.getBlockById?.(activeId);
                return !!b?.locked;
              })()
            }
            onLock={() => {
              // determine selection (selectedIds preferred, fallback to activeBlock)
              const sel =
                selectedIds && selectedIds.length
                  ? selectedIds.slice()
                  : activeId
                  ? [activeId]
                  : [];

              const firstId = sel[0];
              if (!firstId) return;

              // determine current locked state (if first is group read group.locked; else block.locked)
              let currentlyLocked = false;
              if (isGroupId(firstId)) {
                const g = store.getGroupById?.(firstId);
                currentlyLocked = !!g?.locked;
              } else {
                const b = store.getBlockById?.(firstId);
                currentlyLocked = !!b?.locked;
              }
              const nextLocked = !currentlyLocked;

              // compute affected group ids and block ids
              const groupIds = sel.filter(isGroupId);
              const blockIds = sel.flatMap((id) =>
                isGroupId(id) ? store.getGroupById?.(id)?.blockIds ?? [] : [id]
              );

              // build old state snapshots
              const oldGroupStates = {};
              groupIds.forEach((gid) => {
                const g = store.getGroupById?.(gid);
                if (g) oldGroupStates[gid] = { locked: !!g.locked };
              });

              const oldBlockStates = {};
              blockIds.forEach((bid) => {
                const b = store.getBlockById?.(bid);
                if (b) oldBlockStates[bid] = { locked: !!b.locked };
              });

              // compound command (do/undo)
              const cmd = {
                do(s) {
                  // update groups
                  Object.keys(oldGroupStates).forEach((gid) => {
                    const g = s.getGroupById?.(gid);
                    if (g) {
                      // mutate group in-place or replace array entry depending on your store impl
                      if (Array.isArray(s.groups)) {
                        s.groups = s.groups.map((gg) =>
                          gg.id === gid ? { ...gg, locked: nextLocked } : gg
                        );
                      } else if (typeof s.updateGroup === "function") {
                        s.updateGroup(gid, { locked: nextLocked });
                      } else {
                        g.locked = nextLocked;
                      }
                    }
                  });

                  // update blocks
                  Object.keys(oldBlockStates).forEach((bid) => {
                    s.updateBlock(bid, { locked: nextLocked });
                  });
                },
                undo(s) {
                  // restore groups
                  Object.entries(oldGroupStates).forEach(([gid, patch]) => {
                    const g = s.getGroupById?.(gid);
                    if (g) {
                      if (Array.isArray(s.groups)) {
                        s.groups = s.groups.map((gg) =>
                          gg.id === gid ? { ...gg, locked: !!patch.locked } : gg
                        );
                      } else if (typeof s.updateGroup === "function") {
                        s.updateGroup(gid, { locked: !!patch.locked });
                      } else {
                        g.locked = !!patch.locked;
                      }
                    }
                  });

                  // restore blocks
                  Object.entries(oldBlockStates).forEach(([bid, patch]) => {
                    s.updateBlock(bid, { locked: !!patch.locked });
                  });
                },
              };

              // apply command to store
              store.applyCommand(cmd);

              // update UI selection / active id unchanged; keep selection as-is
            }}
            onDuplicate={() => {
              // duplicate active selection or single active block
              const targetId =
                selectedIds && selectedIds.length === 1
                  ? selectedIds[0]
                  : activeId
                  ? activeId
                  : null;
              if (!targetId) return;
              handleDuplicateBlock(targetId);
            }}
            onDelete={handleDeleteActive}
            // grouping props
            canGroup={
              (selectedIds || []).filter((id) => !isGroupId(id)).length >= 2
            }
            onGroup={handleCreateGroup}
            canUngroup={
              (selectedIds || []).some(isGroupId) || isGroupId(activeId)
            }
            onUngroup={() => {
              const gid =
                (selectedIds || []).find(isGroupId) ||
                (isGroupId(activeId) ? activeId : null);
              if (gid) handleUngroup(gid);
            }}
          />

          <SelectionToolbar
            visible
            x={toolbarCoords.selectionX}
            y={toolbarCoords.selectionY}
            blockType={
              activeBlock && !isGroupId(activeBlock.id)
                ? activeBlock.type
                : "image"
            }
            onOpenPosition={() => setIsPositionPanelOpen(true)}
            opacity={
              activeBlock && !isGroupId(activeBlock.id)
                ? activeBlock.opacity ?? 1
                : 1
            }
            onChangeOpacity={handleChangeOpacity}
            onFlipHorizontal={handleFlipHorizontal}
            onFlipVertical={handleFlipVertical}
            borderRadius={
              activeBlock && !isGroupId(activeBlock.id)
                ? activeBlock.borderRadius ?? 0
                : 0
            }
            onChangeBorderRadius={handleChangeBorderRadius}
            textAlign={
              activeBlock && !isGroupId(activeBlock.id)
                ? activeBlock.textAlign
                : undefined
            }
            listType={
              activeBlock && !isGroupId(activeBlock.id)
                ? activeBlock.listType
                : undefined
            }
            onCycleTextAlign={handleCycleTextAlign}
            onCycleListType={handleCycleListType}
            onCreateText={createTextBlock}
            onChangeBackground={handleChangeCanvasBackground}
            currentBackground={currentBackground}
            onChangeTextColor={handleChangeTextColor}
            currentTextColor={
              selectedIds.length === 1 &&
              getBlockById(selectedIds[0])?.type === "text"
                ? getBlockById(selectedIds[0])?.color ?? "#000000"
                : "#000000"
            }
            fontList={fontFamilies}
            currentFontFamily={activeBlock?.fontFamily || ""}
            onChangeFontFamily={handleChangeFontFamily}
            currentFontSize={activeBlock?.fontSize ?? ""}
            onChangeFontSize={handleChangeFontSize}
            onToggleBold={handleToggleBold}
            onToggleItalic={handleToggleItalic}
            onToggleUnderline={handleToggleUnderline}
            onToggleStrike={handleToggleStrike}
            currentBold={!!activeBlock?.bold}
            currentItalic={!!activeBlock?.italic}
            currentUnderline={!!activeBlock?.underline}
            currentStrike={!!activeBlock?.strike}
            onUndo={() => store.undo()}
            onRedo={() => store.redo()}
            canUndo={!!store.canUndo}
            canRedo={!!store.canRedo}
          />
        </>
      )}

      <div className="flex flex-col items-center gap-6">
        <div className="relative flex flex-col items-center">
          <div className="absolute -bottom-10 h-10 w-40 bg-slate-400/30 blur-2xl" />

          <PositionPanel
            open={isPositionPanelOpen && !!activeBlock}
            onClose={() => setIsPositionPanelOpen(false)}
            onArrange={handleArrange}
            onAlign={handleAlign}
            blocks={layers}
            activeId={activeId}
            onSelectLayer={handleSelectLayer}
            onReorderLayers={handleReorderLayers}
            allBlocks={activeBlocks}
          />

          <div
            className="relative flex items-center justify-center bg-white shadow-[0_30px_70px_-40px_rgba(15,23,42,0.7)]"
            style={{
              aspectRatio: baseCanvas.aspectRatio,
              width: `${baseCanvas.width}px`,
              border: baseCanvas.borderColor,
            }}
          >
            {/* <div className="absolute inset-[8px] rounded-[26px] bg-[#fffdf8] shadow-inner" /> */}

            <div
              className="absolute overflow-hidden inset-[0px] bg-[#fffdf8]"
              ref={canvasRef}
              onPointerDown={() => {
                setActiveId(null);
                setSelectedIds([]);
                setEditingBlockId(null);
                setIsPositionPanelOpen(false);
              }}
              style={{ background: canvasBackground || "transparent" }}
            >
              <div className="relative h-full w-full">
                {[...activeBlocks]
                  .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                  .map((block) => {
                    const style = buildBlockStyle(block);
                    return (
                      <div
                        key={block.id}
                        ref={(el) =>
                          store.setBlockRef(activePageId, block.id, el)
                        }
                        className={`absolute ${
                          block.locked ? "cursor-default" : "cursor-move"
                        }`}
                        style={style}
                        onPointerDown={(event) =>
                          handleBlockPointerDown(event, block)
                        }
                        onDoubleClick={(event) =>
                          handleBlockDoubleClick(event, block)
                        }
                      >
                        {renderBlockContent(block)}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="flex w-44 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-md"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-base text-white">
              +
            </span>
            Add page
          </span>
        </button>
      </div>
    </div>
  );
}

export default observer(Home);
