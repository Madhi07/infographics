// index.js (updated - full file)
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
import infographicData from "@/constants/infographicData";
import useInfograhicsData from "@/hooks/useInfographicData";
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

export default function Home() {
  const {
    project,
    activePageId,
    setActivePageId,
    activePage,
    activeBlocks,
    updateActivePageBlocks,
    importProject,
    switchToPage,
    blockRefs, // ref container (exposed by hook if you need)
    setBlockRef, // fn to set ref in JSX
    getBlockRef,
    getBlockById, // convenience from hook
    snapshot,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useInfograhicsData({ initialData: infographicData });
  const [groups, setGroups] = useState([]);
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

  // -------------------------
  // Initialize positions (same as before)
  // -------------------------
  useEffect(() => {
    if (!canvasRef.current || positionsInitialized) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();

    updateActivePageBlocks((prev) =>
      prev.map((block, index) => {
        let updated = { ...block };

        if (typeof updated.zIndex !== "number") {
          updated.zIndex = index;
        }

        if (updated.position) {
          const { x, y } = updated.position;
          updated.position = {
            x: (x / 100) * canvasRect.width,
            y: (y / 100) * canvasRect.height,
          };
        }

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
      })
    );

    setPositionsInitialized(true);
  }, [positionsInitialized, activePageId, activeBlocks]);

  useEffect(() => {
    const onKey = (e) => {
      const cmd = e.ctrlKey || e.metaKey;
      if (!cmd) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        if (canRedo) redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, canUndo, canRedo]);

  // -------------------------
  // Helpers
  // -------------------------
  const isGroupId = (id) => typeof id === "string" && id.startsWith("g-");
  const getGroupById = useCallback(
    (id) => groups.find((g) => g.id === id),
    [groups]
  );

  // compute center/top-left of current selection for helper toolbar positioning
  const computeSelectionBounds = useCallback(() => {
    if (!canvasRef.current) return null;
    if (!selectedIds || selectedIds.length === 0) return null;

    const canvasRect = canvasRef.current.getBoundingClientRect();

    // collect DOM rects for blocks in selection
    const rects = selectedIds
      .flatMap((id) => {
        if (isGroupId(id)) {
          const g = getGroupById(id);
          console.log(g);
          if (!g) return [];
          // group blocks DOM rects:
          return g.blockIds
            .map((bid) => getBlockRef(activePageId, bid))
            .filter(Boolean)
            .map((el) => el.getBoundingClientRect());
        } else {
          const el = getBlockRef(activePageId, id);
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

    // fallback to first item's canvas position
    const firstId = selectedIds[0];
    if (!firstId) return null;
    if (isGroupId(firstId)) {
      const g = getGroupById(firstId);
      if (!g) return null;
      return {
        left: canvasRef.current.getBoundingClientRect().left + g.position.x,
        top: canvasRef.current.getBoundingClientRect().top + g.position.y,
        centerX:
          canvasRef.current.getBoundingClientRect().left +
          g.position.x +
          g.size.width / 2,
        centerY:
          canvasRef.current.getBoundingClientRect().top +
          g.position.y +
          g.size.height / 2,
      };
    } else {
      const b = getBlockById(firstId);
      if (!b) return null;
      return {
        left: canvasRef.current.getBoundingClientRect().left + b.position.x,
        top: canvasRef.current.getBoundingClientRect().top + b.position.y,
        centerX:
          canvasRef.current.getBoundingClientRect().left +
          b.position.x +
          (b.size?.width || 0) / 2,
        centerY:
          canvasRef.current.getBoundingClientRect().top +
          b.position.y +
          (b.size?.height || 0) / 2,
      };
    }
  }, [
    selectedIds,
    groups,
    activePageId,
    activeBlocks,
    getBlockRef,
    getGroupById,
    getBlockById,
  ]);

  // -------------------------
  // Text handlers (unchanged)
  // -------------------------
  const handleTextChange = useCallback(
    (blockId, value) => {
      updateActivePageBlocks((prev) =>
        prev.map((block) =>
          block.id === blockId ? { ...block, content: value } : block
        )
      );
    },
    [updateActivePageBlocks]
  );

  const handleChangeOpacity = useCallback(
    (value) => {
      updateActivePageBlocks((prev) =>
        prev.map((block) =>
          block.id === activeId ? { ...block, opacity: value } : block
        )
      );
    },
    [activeId, updateActivePageBlocks]
  );

  const stopEditing = useCallback(() => {
    snapshot();
    setEditingBlockId(null);
  }, [snapshot]);

  const handleFlipHorizontal = useCallback(() => {
    if (!activeId) return;
    updateActivePageBlocks((prev) =>
      prev.map((block) =>
        block.id === activeId ? { ...block, flipH: !block.flipH } : block
      )
    );
  }, [activeId, updateActivePageBlocks]);

  const handleFlipVertical = useCallback(() => {
    if (!activeId) return;
    updateActivePageBlocks((prev) =>
      prev.map((block) =>
        block.id === activeId ? { ...block, flipV: !block.flipV } : block
      )
    );
  }, [activeId, updateActivePageBlocks]);

  const handleChangeBorderRadius = useCallback(
    (value) => {
      if (!activeId) return;
      updateActivePageBlocks((prev) =>
        prev.map((block) =>
          block.id === activeId ? { ...block, borderRadius: value } : block
        )
      );
    },
    [activeId, updateActivePageBlocks]
  );

  const handleChangeFontFamily = useCallback(
    (fontValue) => {
      if (!selectedIds || selectedIds.length === 0) return;

      // If single selection is a group, apply to text blocks inside the group
      if (selectedIds.length === 1 && isGroupId(selectedIds[0])) {
        const gid = selectedIds[0];
        const group = getGroupById(gid);
        if (!group) return;
        updateActivePageBlocks((prev) =>
          prev.map((b) =>
            group.blockIds.includes(b.id) && b.type === "text"
              ? { ...b, fontFamily: fontValue }
              : b
          )
        );
        return;
      }

      updateActivePageBlocks((prev) =>
        prev.map((b) =>
          selectedIds.includes(b.id) && b.type === "text"
            ? { ...b, fontFamily: fontValue }
            : b
        )
      );
    },
    [selectedIds, groups, updateActivePageBlocks]
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

    const el = getBlockRef(activePageId, activeBlock.id);
    if (!el) {
      setActiveRectState(null);
      return;
    }

    // measure synchronously after DOM updates
    const rect = el.getBoundingClientRect();
    setActiveRectState(rect);

    // second pass on next frame to catch font/layout shifts
    let raf = requestAnimationFrame(() => {
      const el2 = getBlockRef(activePageId, activeBlock.id);
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

        // Groups get side handles for cropping if they contain images
        const hasImages = group.blockIds.some((id) => {
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

  // -------------------------
  // Interaction: move / resize / rotate
  // - supports group move if blockId is group id (g-...)
  // -------------------------
  const handlePointerMove = useCallback(
    (event) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const { blockId, blockSnapshot, canvasRect, type } = interaction;

      // GROUP MOVE branch: if blockId is group id, update each child by delta
      if (isGroupId(blockId) && type === "move") {
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        // Use canvasRect that was captured at beginInteraction
        const canvasRect =
          interaction.canvasRect || canvasRef.current?.getBoundingClientRect();

        // Try to use a workspaceRef (preferred). If you don't have one, fallback to window dimensions.
        const workspaceRect =
          typeof workspaceRef !== "undefined" && workspaceRef.current
            ? workspaceRef.current.getBoundingClientRect()
            : {
                left: 0,
                top: 0,
                width: window.innerWidth,
                height: window.innerHeight,
              };

        // new group top-left in canvas-local coords:
        // interaction.groupSnapshotPosition is already canvas-local (per your comment)
        let newGroupX = interaction.groupSnapshotPosition.x + deltaX;
        let newGroupY = interaction.groupSnapshotPosition.y + deltaY;

        // Compute effective axis-aligned size of the group (accounts for rotation)
        const gw = interaction.blockSnapshot?.size?.width ?? 0;
        const gh = interaction.blockSnapshot?.size?.height ?? 0;
        const gtheta =
          ((interaction.blockSnapshot?.rotation || 0) * Math.PI) / 180;
        const gc = Math.abs(Math.cos(gtheta));
        const gs = Math.abs(Math.sin(gtheta));
        const effectiveGroupW = Math.abs(gw * gc) + Math.abs(gh * gs);
        const effectiveGroupH = Math.abs(gw * gs) + Math.abs(gh * gc);

        // workspaceRect.left/top are in viewport coordinates; canvasRect.left/top are too.
        // So workspace-left-in-canvas = workspaceRect.left - canvasRect.left
        const workspaceLeftInCanvas =
          workspaceRect.left - (canvasRect?.left ?? 0);
        const workspaceTopInCanvas = workspaceRect.top - (canvasRect?.top ?? 0);
        const workspaceRightInCanvas =
          workspaceLeftInCanvas + workspaceRect.width;
        const workspaceBottomInCanvas =
          workspaceTopInCanvas + workspaceRect.height;

        // minX/minY allow some negative so user can pull the group left/top outside the canvas.
        // maxX/maxY prevent the group's visual right/bottom from escaping the workspace.
        const allowOutsideFactor = 0.9; // same as single-block logic
        const minX =
          workspaceLeftInCanvas - effectiveGroupW * allowOutsideFactor;
        const minY =
          workspaceTopInCanvas - effectiveGroupH * allowOutsideFactor;

        // For the right/bottom, ensure group's right/bottom (top-left + effective size)
        // does not go beyond workspace right/bottom.
        const maxX = workspaceRightInCanvas - effectiveGroupW;
        const maxY = workspaceBottomInCanvas - effectiveGroupH;

        // Apply clamp
        const clampedGroupX = Math.min(Math.max(newGroupX, minX), maxX);
        const clampedGroupY = Math.min(Math.max(newGroupY, minY), maxY);

        // Update each child position = groupTopLeft + child's saved offset
        updateActivePageBlocks((prev) =>
          prev.map((blk) => {
            if (!interaction.groupBlockIds.includes(blk.id)) return blk;
            const offset = interaction.blockOffsets?.[blk.id] || { x: 0, y: 0 };

            // If you stored each child's rotation/size snapshot and want to keep perfect bounds,
            // you could reapply child-level rotation-aware clamps here. For parity with single-block
            // move, we just set top-left = groupTopLeft + offset.
            return {
              ...blk,
              position: {
                x: clampedGroupX + offset.x,
                y: clampedGroupY + offset.y,
              },
            };
          })
        );

        // also update group meta position live so overlay stays in sync
        setGroups((prev) =>
          prev.map((g) =>
            g.id === blockId
              ? { ...g, position: { x: clampedGroupX, y: clampedGroupY } }
              : g
          )
        );

        return;
      }

      // GROUP RESIZE branch
      if (type === "resize" && isGroupId(blockId)) {
        const group = interaction.blockSnapshot;
        if (!group || !interaction.handle) return;

        const handle = interaction.handle;
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        const groupSnapshot = interaction.blockSnapshot;
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
          scaleX = newGroupWidth / startWidth;
        }
        if (handle.includes("left")) {
          const newWidth = Math.max(40, startWidth - deltaX);
          scaleX = newWidth / startWidth;
          newGroupX = startX + (startWidth - newWidth);
          newGroupWidth = newWidth;
        }
        if (handle.includes("bottom")) {
          newGroupHeight = Math.max(40, startHeight + deltaY);
          scaleY = newGroupHeight / startHeight;
        }
        if (handle.includes("top")) {
          const newHeight = Math.max(40, startHeight - deltaY);
          scaleY = newHeight / startHeight;
          newGroupY = startY + (startHeight - newHeight);
          newGroupHeight = newHeight;
        }

        // Update all child blocks proportionally
        const childSnapshots = interaction.childSnapshots || [];
        const blockOffsets = interaction.blockOffsets || {};

        updateActivePageBlocks((prev) =>
          prev.map((block) => {
            if (!group.blockIds.includes(block.id)) return block;

            const snapshot = childSnapshots.find((s) => s.id === block.id);
            if (!snapshot) return block;

            const offset = blockOffsets[block.id] || { x: 0, y: 0 };

            // Scale the offset and size
            const newOffsetX = offset.x * scaleX;
            const newOffsetY = offset.y * scaleY;

            const newBlockX = newGroupX + newOffsetX;
            const newBlockY = newGroupY + newOffsetY;

            const newSize = { ...block.size };
            if (typeof snapshot.size?.width === "number") {
              newSize.width = snapshot.size.width * scaleX;
            }
            if (typeof snapshot.size?.height === "number") {
              newSize.height = snapshot.size.height * scaleY;
            }

            // Scale font size for text blocks
            let newFontSize = block.fontSize;
            if (
              block.type === "text" &&
              typeof snapshot.fontSize === "number"
            ) {
              newFontSize = snapshot.fontSize * Math.min(scaleX, scaleY);
            }

            return {
              ...block,
              position: { x: newBlockX, y: newBlockY },
              size: newSize,
              fontSize: newFontSize,
            };
          })
        );

        // Update group metadata
        setGroups((prev) =>
          prev.map((g) =>
            g.id === blockId
              ? {
                  ...g,
                  position: { x: newGroupX, y: newGroupY },
                  size: { width: newGroupWidth, height: newGroupHeight },
                  blockOffsets: Object.fromEntries(
                    Object.entries(blockOffsets).map(([id, offset]) => [
                      id,
                      { x: offset.x * scaleX, y: offset.y * scaleY },
                    ])
                  ),
                }
              : g
          )
        );

        return;
      }

      // GROUP CROP branch
      if (type === "crop" && isGroupId(blockId)) {
        const group = interaction.blockSnapshot;
        if (!group || !interaction.handle) return;

        const handle = interaction.handle;
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        const groupSnapshot = interaction.blockSnapshot;
        const startWidth = groupSnapshot.size?.width || 1;
        const startHeight = groupSnapshot.size?.height || 1;

        // Calculate crop percentages based on group dimensions
        const cropDeltaX = (deltaX / startWidth) * 100;
        const cropDeltaY = (deltaY / startHeight) * 100;

        // Apply crop to all image blocks in the group
        updateActivePageBlocks((prev) =>
          prev.map((block) => {
            if (!group.blockIds.includes(block.id) || block.type !== "image") {
              return block;
            }

            const currentCrop = getCropValues(block.crop);
            const nextCrop = { ...currentCrop };

            if (handle === "left") {
              nextCrop.left = clampCropValue(currentCrop.left + cropDeltaX);
            }
            if (handle === "right") {
              nextCrop.right = clampCropValue(currentCrop.right - cropDeltaX);
            }
            if (handle === "top") {
              nextCrop.top = clampCropValue(currentCrop.top + cropDeltaY);
            }
            if (handle === "bottom") {
              nextCrop.bottom = clampCropValue(currentCrop.bottom - cropDeltaY);
            }

            // Ensure total crop doesn't exceed 90%
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

            return { ...block, crop: nextCrop };
          })
        );

        return;
      }

      // GROUP ROTATE branch
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
        const groupCx = groupSnapshot.position.x + groupSnapshot.size.width / 2;
        const groupCy =
          groupSnapshot.position.y + groupSnapshot.size.height / 2;

        // Pre-calculate updates
        const updates = {};
        childSnapshots.forEach((snapshot) => {
          // 1. Update Rotation
          const newRotation = (snapshot.rotation || 0) + deltaDegrees;

          // 2. Update Position
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

        // Apply updates to blocks
        updateActivePageBlocks((prev) =>
          prev.map((block) => {
            if (updates[block.id]) {
              return { ...block, ...updates[block.id] };
            }
            return block;
          })
        );

        // Update group metadata (rotation + offsets)
        // We must update offsets so that subsequent moves work correctly
        const newBlockOffsets = {};
        Object.entries(updates).forEach(([bid, data]) => {
          newBlockOffsets[bid] = {
            x: data.position.x - groupSnapshot.position.x,
            y: data.position.y - groupSnapshot.position.y,
          };
        });

        setGroups((prev) =>
          prev.map((g) =>
            g.id === blockId
              ? {
                  ...g,
                  rotation: degrees,
                  blockOffsets: { ...g.blockOffsets, ...newBlockOffsets },
                }
              : g
          )
        );

        return;
      }

      // --- existing single-block handlers (move / resize / crop / rotate) ---
      if (type === "move") {
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;

        // Use canvasRect that was captured at beginInteraction
        const canvasRect =
          interaction.canvasRect || canvasRef.current?.getBoundingClientRect();

        // Try to use a workspaceRef (preferred). If you don't have one, fallback to window dimensions.
        const workspaceRect =
          typeof workspaceRef !== "undefined" && workspaceRef.current
            ? workspaceRef.current.getBoundingClientRect()
            : {
                left: 0,
                top: 0,
                width: window.innerWidth,
                height: window.innerHeight,
              };

        updateActivePageBlocks((prev) =>
          prev.map((block) => {
            if (block.id !== blockId) return block;

            // new candidate top-left in canvas-local coords
            let nextX = blockSnapshot.position.x + deltaX;
            let nextY = blockSnapshot.position.y + deltaY;

            // compute effective axis-aligned size of the block (accounts for rotation)
            const w = blockSnapshot.size?.width ?? 0;
            const h = blockSnapshot.size?.height ?? 0;
            const theta = ((blockSnapshot.rotation || 0) * Math.PI) / 180;
            const c = Math.abs(Math.cos(theta));
            const s = Math.abs(Math.sin(theta));
            const effectiveW = Math.abs(w * c) + Math.abs(h * s);
            const effectiveH = Math.abs(w * s) + Math.abs(h * c);

            // workspaceRect.left/top are in viewport coordinates; canvasRect.left/top are too.
            // So workspace-left-in-canvas = workspaceRect.left - canvasRect.left
            const workspaceLeftInCanvas =
              workspaceRect.left - (canvasRect?.left ?? 0);
            console.log(`${canvasRect?.left ?? 0}`);
            const workspaceTopInCanvas =
              workspaceRect.top - (canvasRect?.top ?? 0);
            console.log(`${canvasRect?.top ?? 0}`);
            const workspaceRightInCanvas =
              workspaceLeftInCanvas + workspaceRect.width;
            const workspaceBottomInCanvas =
              workspaceTopInCanvas + workspaceRect.height;

            // minX/minY allow some negative so user can pull the block left/top outside the canvas.
            // maxX/maxY prevent the block's visual right/bottom from escaping the workspace.
            const allowOutsideFactor = 0.9; // how much (fraction of width/height) allowed outside on left/top
            const minX =
              workspaceLeftInCanvas - effectiveW * allowOutsideFactor;
            const minY = workspaceTopInCanvas - effectiveH * allowOutsideFactor;

            // For the right/bottom, we ensure the block's right/bottom (top-left + effective size)
            // does not go beyond workspace right/bottom. So maxTopLeft = workspaceRight - effectiveSize
            const maxX = workspaceRightInCanvas - effectiveW;
            const maxY = workspaceBottomInCanvas - effectiveH;

            // Apply clamp
            nextX = Math.min(Math.max(nextX, minX), maxX);
            nextY = Math.min(Math.max(nextY, minY), maxY);

            return {
              ...block,
              position: {
                x: nextX,
                y: nextY,
              },
            };
          })
        );
      }

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

          updateActivePageBlocks((prev) =>
            prev.map((block) =>
              block.id === blockId
                ? {
                    ...block,
                    position: { ...block.position, x: newLeft },
                    size: {
                      ...(block.size || {}),
                      width: newWidth,
                    },
                    fontSize: newFontSize,
                  }
                : block
            )
          );

          return;
        }

        // Default resize (images, non-text, and text side handles)
        const startWidth = blockSnapshot.size.width;
        const startHeight = blockSnapshot.size.height;
        let nextWidth = startWidth;
        let nextHeight = startHeight;
        let nextX = blockSnapshot.position.x;
        let nextY = blockSnapshot.position.y;
        const minSize = 40;

        // Horizontal resize
        if (handle.includes("right")) {
          const maxWidth = canvasRect.width - blockSnapshot.position.x;
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

        // Vertical resize (non-text only)
        if (handle.includes("bottom") && typeof startHeight === "number") {
          const maxHeight = canvasRect.height - blockSnapshot.position.y;
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

        updateActivePageBlocks((prev) =>
          prev.map((block) =>
            block.id === blockId
              ? {
                  ...block,
                  position: { x: nextX, y: nextY },
                  size: {
                    ...(block.size || {}),
                    width: nextWidth,
                    height:
                      typeof startHeight === "number"
                        ? nextHeight
                        : block.size?.height,
                  },
                }
              : block
          )
        );
      }

      if (
        type === "crop" &&
        blockSnapshot.type === "image" &&
        hasNumericSize(blockSnapshot)
      ) {
        const handle = interaction.handle;
        if (!handle) return;

        const cropSnapshot = getCropValues(blockSnapshot.crop);
        const { width, height } = blockSnapshot.size;
        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;
        const nextCrop = { ...cropSnapshot };

        if (handle === "left") {
          nextCrop.left = clampCropValue(
            cropSnapshot.left + (deltaX / width) * 100
          );
        }
        if (handle === "right") {
          nextCrop.right = clampCropValue(
            cropSnapshot.right - (deltaX / width) * 100
          );
        }
        if (handle === "top") {
          nextCrop.top = clampCropValue(
            cropSnapshot.top + (deltaY / height) * 100
          );
        }
        if (handle === "bottom") {
          nextCrop.bottom = clampCropValue(
            cropSnapshot.bottom - (deltaY / height) * 100
          );
        }

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

        updateActivePageBlocks((prev) =>
          prev.map((block) =>
            block.id === blockId ? { ...block, crop: nextCrop } : block
          )
        );
      }

      if (type === "rotate" && hasNumericSize(blockSnapshot)) {
        const { center, startAngle, initialRotation } = interaction;
        const currentAngle = Math.atan2(
          event.clientY - center.y,
          event.clientX - center.x
        );
        const deltaAngle = currentAngle - startAngle;
        const degrees = ((deltaAngle * 180) / Math.PI + initialRotation) % 360;

        updateActivePageBlocks((prev) =>
          prev.map((block) =>
            block.id === blockId
              ? {
                  ...block,
                  rotation: Number.isFinite(degrees) ? degrees : 0,
                }
              : block
          )
        );
      }
    },
    [updateActivePageBlocks, setGroups]
  );

  const endInteraction = useCallback(() => {
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", endInteraction);
    interactionRef.current = null;
  }, [handlePointerMove]);

  const handleChangeCanvasBackground = useCallback((color) => {
    setCanvasBackground(color);
  }, []);

  const toggleTextFormatForSelection = useCallback(
    (patchFn) => {
      if (!selectedIds || selectedIds.length === 0) return;

      // If single selection is a group, apply to text blocks inside the group
      if (selectedIds.length === 1 && isGroupId(selectedIds[0])) {
        const gid = selectedIds[0];
        const group = getGroupById(gid);
        if (!group) return;
        updateActivePageBlocks((prev) =>
          prev.map((b) =>
            group.blockIds.includes(b.id) && b.type === "text" ? patchFn(b) : b
          )
        );
        return;
      }

      updateActivePageBlocks((prev) =>
        prev.map((b) =>
          selectedIds.includes(b.id) && b.type === "text" ? patchFn(b) : b
        )
      );
    },
    [selectedIds, groups, updateActivePageBlocks]
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
      if (!size) return;

      // prefer current selection; fallback to activeId (single selection)
      const selIds =
        selectedIds && selectedIds.length
          ? selectedIds
          : activeId
          ? [activeId]
          : [];

      if (selIds.length === 0) return;

      // If single selection is a group, apply to text blocks inside the group
      if (selIds.length === 1 && isGroupId(selIds[0])) {
        const gid = selIds[0];
        const group = getGroupById(gid);
        if (!group) return;
        updateActivePageBlocks((prev) =>
          prev.map((b) =>
            group.blockIds.includes(b.id) && b.type === "text"
              ? { ...b, fontSize: size }
              : b
          )
        );
        return;
      }

      // Apply to all selected text blocks
      updateActivePageBlocks((prev) =>
        prev.map((b) =>
          selIds.includes(b.id) && b.type === "text"
            ? { ...b, fontSize: size }
            : b
        )
      );
    },
    [selectedIds, activeId, updateActivePageBlocks, groups]
  );

  // ---------- Text color handler (for selected text blocks) ----------
  const handleChangeTextColor = useCallback(
    (color) => {
      if (!selectedIds || selectedIds.length === 0) return;

      // If a single selection and it's a group, apply to text blocks inside the group.
      if (selectedIds.length === 1 && isGroupId(selectedIds[0])) {
        const gid = selectedIds[0];
        const group = getGroupById(gid);
        if (!group) return;

        updateActivePageBlocks((prev) =>
          prev.map((b) =>
            group.blockIds.includes(b.id) && b.type === "text"
              ? { ...b, color }
              : b
          )
        );

        return;
      }

      // Otherwise apply to all selected block ids that are text blocks
      updateActivePageBlocks((prev) =>
        prev.map((b) =>
          selectedIds.includes(b.id) && b.type === "text" ? { ...b, color } : b
        )
      );
    },
    [selectedIds, updateActivePageBlocks, groups]
  );

  const createTextBlock = useCallback(() => {
    const genId = (prefix = "b") =>
      `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    // compute a sensible default position:
    // If there's a currently selected block use its center; otherwise place in canvas center.
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const defaultX = (canvasRect?.width ?? 800) / 2 - 120; // left so it's centered visually
    const defaultY = (canvasRect?.height ?? 600) / 2 - 24;

    const newId = genId("b");
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
      zIndex:
        (activeBlocks.reduce((m, b) => Math.max(m, b.zIndex ?? 0), 0) || 0) + 1,
      locked: false,
    };
    snapshot();
    updateActivePageBlocks((prev) => [...prev, newBlock]);
    setSelectedIds([newId]);
    setActiveId(newId);

    // If you use groups or overlay, ensure selection shows toolbar immediately:
    // setTimeout(() => { /* optional slight delay to ensure overlay updates */ }, 0);
  }, [
    canvasRef,
    updateActivePageBlocks,
    setSelectedIds,
    setActiveId,
    activeBlocks,
  ]);

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

      snapshot();

      // If blockId is a group id, we snapshot all children so we can move them together
      // inside beginInteraction (group branch)
      if (isGroupId(blockId)) {
        const g = getGroupById(blockId);
        if (!g) return;

        // snapshot children (we still keep child snapshots for safety)
        const childSnapshots = g.blockIds
          .map((bid) => {
            const b = activeBlocks.find((bb) => bb.id === bid);
            return b ? JSON.parse(JSON.stringify(b)) : null;
          })
          .filter(Boolean);

        const payload = {
          type,
          blockId,
          startX: event.clientX,
          startY: event.clientY,
          canvasRect,
          blockSnapshot: { ...g }, // group snapshot
          groupBlockIds: [...g.blockIds],
          childSnapshots,
          // the offsets we need to recompute positions exactly
          blockOffsets: { ...(g.blockOffsets || {}) },
          groupSnapshotPosition: { ...(g.position || { x: 0, y: 0 }) },
          ...options,
        };

        if (type === "rotate") {
          const blockSnapshot = payload.blockSnapshot;
          const blockWidth = blockSnapshot.size.width;
          const blockHeight = blockSnapshot.size.height ?? 0;

          const centerX =
            canvasRect.left + blockSnapshot.position.x + blockWidth / 2;
          const centerY =
            canvasRect.top + blockSnapshot.position.y + blockHeight / 2;

          payload.center = { x: centerX, y: centerY };
          payload.startAngle = Math.atan2(
            event.clientY - centerY,
            event.clientX - centerX
          );
          payload.initialRotation = blockSnapshot.rotation ?? 0;
        }

        interactionRef.current = payload;
        setActiveId(blockId);
        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", endInteraction);
        return;
      }

      // single-block case (existing logic)
      const blockSnapshot = activeBlocks.find((block) => block.id === blockId);
      if (!blockSnapshot) return;

      if (blockSnapshot.locked) {
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
        blockSnapshot: JSON.parse(JSON.stringify(blockSnapshot)),
        ...options,
      };

      if (type === "rotate" && hasNumericSize(blockSnapshot)) {
        const blockWidth = blockSnapshot.size.width;
        const blockHeight = blockSnapshot.size.height ?? 0;

        const centerX =
          canvasRect.left + blockSnapshot.position.x + blockWidth / 2;
        const centerY =
          canvasRect.top + blockSnapshot.position.y + blockHeight / 2;

        payload.center = { x: centerX, y: centerY };
        payload.startAngle = Math.atan2(
          event.clientY - centerY,
          event.clientX - centerX
        );
        payload.initialRotation = blockSnapshot.rotation ?? 0;
      }

      interactionRef.current = payload;
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", endInteraction);
    },
    [activeBlocks, handlePointerMove, endInteraction, groups, getGroupById]
  );

  // -------------------------
  // Selection and multi-select: Ctrl/Cmd/Shift toggles membership
  // -------------------------
  const handleBlockPointerDown = useCallback(
    (event, block) => {
      if (block.type === "text" && editingBlockId === block.id) {
        event.stopPropagation();
        return;
      }

      // multi-select modifier
      const multi = event.shiftKey || event.metaKey || event.ctrlKey;

      // If block is in a group, select the group instead
      const targetId = block.groupId || block.id;

      if (block.locked) {
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

      if (multi) {
        // toggle membership only, don't start dragging
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

      // single select & begin move
      // set selection to this single id and start moving
      setSelectedIds([targetId]);
      beginInteraction(event, "move", targetId);
    },
    [beginInteraction, editingBlockId]
  );

  // -------------------------
  // Delete and duplicate: extend to groups
  // -------------------------
  const handleDeleteActive = useCallback(() => {
    if (!activeId) return;
    snapshot();
    if (isGroupId(activeId)) {
      const group = groups.find((g) => g.id === activeId);
      if (!group) return;
      // delete group members
      updateActivePageBlocks((prev) =>
        prev.filter((b) => !group.blockIds.includes(b.id))
      );
      // remove group meta
      setGroups((prev) => prev.filter((g) => g.id !== activeId));
      setSelectedIds([]);
      setActiveId(null);
      setEditingBlockId(null);
      setIsPositionPanelOpen(false);
      return;
    }

    updateActivePageBlocks((prev) =>
      prev.filter((block) => block.id !== activeId)
    );
    setActiveId(null);
    setEditingBlockId(null);
    setIsPositionPanelOpen(false);
  }, [activeId, groups, updateActivePageBlocks]);

  const handleToggleLock = useCallback(
    (blockId) => {
      updateActivePageBlocks((prev) =>
        prev.map((block) =>
          block.id === blockId ? { ...block, locked: !block.locked } : block
        )
      );
    },
    [updateActivePageBlocks]
  );

  // Duplicate single block or group
  const handleDuplicateBlock = useCallback(
    (id) => {
      snapshot();
      // duplicate group
      if (isGroupId(id)) {
        const group = getGroupById(id);
        if (!group) return;

        const newGroupId = `g-${Date.now()}-${Math.floor(
          Math.random() * 1000
        )}`;
        const offset = 16;
        const newBlockIds = [];
        const newBlockOffsets = {}; // Store new offsets

        const copies = group.blockIds
          .map((bid) => {
            const original = activeBlocks.find((b) => b.id === bid);
            if (!original) return null;

            // Generate a unique ID for the new block
            const newId = `${original.id}-${Date.now()}-${Math.floor(
              Math.random() * 1000
            )}`;
            newBlockIds.push(newId);

            // Copy the offset from the original group using the original ID
            if (group.blockOffsets && group.blockOffsets[bid]) {
              newBlockOffsets[newId] = { ...group.blockOffsets[bid] };
            }

            return {
              ...JSON.parse(JSON.stringify(original)),
              id: newId,
              groupId: newGroupId, // Assign to the new group
              position: {
                x: (original.position.x ?? 0) + offset,
                y: (original.position.y ?? 0) + offset,
              },
              zIndex: (original.zIndex ?? 0) + 1,
            };
          })
          .filter(Boolean);

        const newGroup = {
          ...JSON.parse(JSON.stringify(group)),
          id: newGroupId,
          blockIds: newBlockIds,
          blockOffsets: newBlockOffsets, // Assign the new offsets
          position: {
            x: (group.position.x ?? 0) + offset,
            y: (group.position.y ?? 0) + offset,
          },
        };

        updateActivePageBlocks((prev) => [...prev, ...copies]);
        setGroups((prev) => [...prev, newGroup]);

        // Select the new group
        setSelectedIds([newGroupId]);
        setActiveId(newGroupId);
        return;
      }

      // duplicate single block
      updateActivePageBlocks((prev) => {
        const target = prev.find((b) => b.id === id);
        if (!target) return prev;

        const maxZ = prev.reduce((max, b) => Math.max(max, b.zIndex ?? 0), 0);

        const newId = `${id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const offset = 16;

        const newBlock = {
          ...target,
          id: newId,
          locked: false,
          position: {
            x: (target.position?.x ?? 0) + offset,
            y: (target.position?.y ?? 0) + offset,
          },
          zIndex: maxZ + 1,
        };

        return [...prev, newBlock];
      });
    },
    [activeBlocks, groups, updateActivePageBlocks]
  );

  // -------------------------
  // Selection helpers
  // -------------------------
  const handleSelectLayer = useCallback((id) => {
    setActiveId(id);
    setEditingBlockId(null);
    setSelectedIds([id]);
  }, []);

  // Cycle text align / list (unchanged)
  const handleCycleTextAlign = useCallback(() => {
    if (!activeId) return;
    updateActivePageBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== activeId) return b;
        const current = b.textAlign || "center";
        const idx = ALIGN_ORDER.indexOf(current);
        const next = ALIGN_ORDER[(idx + 1) % ALIGN_ORDER.length];
        return { ...b, textAlign: next };
      })
    );
  }, [activeId]);

  const handleCycleListType = useCallback(() => {
    if (!activeId) return;
    updateActivePageBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== activeId) return b;
        const current = b.listType || "normal";
        const idx = LIST_ORDER.indexOf(current);
        const next = LIST_ORDER[(idx + 1) % LIST_ORDER.length];
        return { ...b, listType: next };
      })
    );
  }, [activeId]);

  // -------------------------
  // Grouping: create / ungroup
  // -------------------------
  function computeGroupBBox(blockIds) {
    // prefer DOM rects
    const rects = blockIds
      .map((id) => getBlockRef(activePageId, id))
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
        viewport: true,
      };
    }

    // fallback to canvas positions
    const chosen = activeBlocks.filter((b) => blockIds.includes(b.id));
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
      viewport: false,
    };
  }

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

    // compute offsets of each block relative to group position (canvas-local)
    const blockOffsets = {};
    blockIds.forEach((bid) => {
      const b = activeBlocks.find((bb) => bb.id === bid);
      if (!b) return;
      // offset based on block.position (canvas-local)
      blockOffsets[bid] = {
        x: (b.position?.x ?? 0) - position.x,
        y: (b.position?.y ?? 0) - position.y,
      };
    });

    const groupId = `g-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const groupMeta = {
      id: groupId,
      blockIds,
      position,
      size,
      rotation: 0,
      blockOffsets,
    };
    snapshot();
    // assign groupId to blocks (we don't change individual positions here)
    updateActivePageBlocks((prev) =>
      prev.map((b) => (blockIds.includes(b.id) ? { ...b, groupId } : b))
    );
    setGroups((prev) => [...prev, groupMeta]);

    // select the new group
    setSelectedIds([groupId]);
    setActiveId(groupId);
  }, [selectedIds, activeBlocks, getBlockRef]);

  const handleUngroup = useCallback(
    (groupIdArg) => {
      const groupId = groupIdArg || selectedIds.find(isGroupId);
      if (!groupId) return;
      snapshot();
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      updateActivePageBlocks((prev) =>
        prev.map((b) =>
          b.groupId === groupId ? { ...b, groupId: undefined } : b
        )
      );

      // After ungroup, select the former members (best UX)
      const group = groups.find((g) => g.id === groupId);
      const members = group?.blockIds ?? [];
      setSelectedIds(members.length ? members : []);
      setActiveId(members.length ? members[0] : null);
    },
    [selectedIds, groups, updateActivePageBlocks]
  );

  // -------------------------
  // Arrange / align / keyboard shortcuts
  // -------------------------
  useEffect(() => {
    const onKeyDown = (e) => {
      // group: Ctrl/Cmd+G, ungroup: Ctrl/Cmd+Shift+G
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) {
          // ungroup
          const gid = selectedIds.find(isGroupId);
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
  }, [selectedIds, handleCreateGroup, handleUngroup]);

  // -------------------------
  // cleanup pointer listeners (existing)
  // -------------------------
  useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", endInteraction);
    };
  }, [handlePointerMove, endInteraction]);

  // -------------------------
  // Compute layers for PositionPanel
  // -------------------------
  const layers = [
    ...activeBlocks.filter((b) => !b.groupId),
    ...groups.map((g) => ({
      ...g,
      type: "group",
      // Use max zIndex of children for sorting
      zIndex: Math.max(
        ...g.blockIds.map(
          (bid) => activeBlocks.find((b) => b.id === bid)?.zIndex ?? 0
        ),
        0
      ),
    })),
  ];

  // -------------------------
  // Render
  // -------------------------
  // -------------------------
  // Reorder layers (PositionPanel)
  // -------------------------
  const handleReorderLayers = useCallback(
    (newOrderedIds) => {
      // newOrderedIds is [TopLayerId, ..., BottomLayerId]
      // We process from bottom to top to assign increasing zIndex
      const reversedIds = [...newOrderedIds].reverse();
      let currentZ = 1;

      updateActivePageBlocks((prev) => {
        const nextBlocks = [...prev];

        reversedIds.forEach((layerId) => {
          if (isGroupId(layerId)) {
            const group = groups.find((g) => g.id === layerId);
            if (group) {
              // Sort children by existing zIndex to keep internal order
              const children = nextBlocks.filter((b) =>
                group.blockIds.includes(b.id)
              );
              children.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

              children.forEach((child) => {
                const idx = nextBlocks.findIndex((b) => b.id === child.id);
                if (idx !== -1) {
                  nextBlocks[idx] = { ...nextBlocks[idx], zIndex: currentZ++ };
                }
              });
            }
          } else {
            const idx = nextBlocks.findIndex((b) => b.id === layerId);
            if (idx !== -1) {
              nextBlocks[idx] = { ...nextBlocks[idx], zIndex: currentZ++ };
            }
          }
        });

        return nextBlocks;
      });
    },
    [groups, updateActivePageBlocks]
  );

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
            locked={!!(activeBlock && activeBlock.locked)}
            onLock={() => {
              const sel = selectedIds.length
                ? selectedIds
                : activeBlock
                ? [activeBlock.id]
                : [];

              const firstId = sel[0];
              if (!firstId) return;

              let currentlyLocked = false;
              if (isGroupId(firstId)) {
                const g = groups.find((g) => g.id === firstId);
                currentlyLocked = !!g?.locked;
              } else {
                const b = activeBlocks.find((b) => b.id === firstId);
                currentlyLocked = !!b?.locked;
              }

              const nextLocked = !currentlyLocked;

              // Update groups
              const groupIds = sel.filter(isGroupId);
              if (groupIds.length > 0) {
                setGroups((prev) =>
                  prev.map((g) =>
                    groupIds.includes(g.id) ? { ...g, locked: nextLocked } : g
                  )
                );
              }

              // Update blocks (including children of groups)
              const blockIds = sel.flatMap((id) =>
                isGroupId(id)
                  ? groups.find((g) => g.id === id)?.blockIds ?? []
                  : [id]
              );

              if (blockIds.length > 0) {
                updateActivePageBlocks((prev) =>
                  prev.map((b) =>
                    blockIds.includes(b.id) ? { ...b, locked: nextLocked } : b
                  )
                );
              }
            }}
            onDuplicate={() => {
              // duplicate active selection or single active block
              const targetId =
                selectedIds.length === 1
                  ? selectedIds[0]
                  : activeBlock
                  ? activeBlock.id
                  : null;
              if (!targetId) return;
              handleDuplicateBlock(targetId);
            }}
            onDelete={handleDeleteActive}
            // grouping props
            canGroup={selectedIds.filter((id) => !isGroupId(id)).length >= 2}
            onGroup={handleCreateGroup}
            canUngroup={
              selectedIds.some(isGroupId) || isGroupId(activeBlock?.id)
            }
            onUngroup={() => {
              const gid =
                selectedIds.find(isGroupId) ||
                (isGroupId(activeBlock?.id) ? activeBlock.id : null);
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
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </>
      )}

      <div className="flex flex-col items-center gap-6">
        <div className="relative flex flex-col items-center">
          <div className="absolute -bottom-10 h-10 w-40 bg-slate-400/30 blur-2xl" />

          <PositionPanel
            open={isPositionPanelOpen && !!activeBlock}
            onClose={() => setIsPositionPanelOpen(false)}
            onArrange={() => {}}
            onAlign={() => {}}
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
                        ref={(el) => setBlockRef(activePageId, block.id, el)}
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
