import React, { useEffect, useRef, useState } from "react";
import { Reorder } from "framer-motion";

function getLayerLabel(block) {
  if (!block) return "Layer";

  if (block.type === "group") return "Group";
  if (block.type === "text") {
    const firstLine = (block.content || "").split("\n")[0].trim();
    return firstLine || "Text";
  }

  if (block.type === "image") return block.alt || "Image";
  if (block.type === "palette") return "Palette";
  if (block.type === "line") return "Line";

  return block.type.charAt(0).toUpperCase() + block.type.slice(1);
}

// Small thumbnail/preview for each layer type
function renderLayerPreview(block, allBlocks = []) {
  if (!block) return null;

  if (block.type === "group") {
    // Try to find images inside the group
    const children = (block.blockIds || [])
      .map((id) => allBlocks.find((b) => b.id === id))
      .filter(Boolean);

    const images = children.filter((b) => b.type === "image");

    if (images.length > 0) {
      // Show a stack of up to 3 images
      return (
        <div className="flex items-center justify-center -space-x-4">
          {images.slice(0, 3).map((img, i) => (
            <div
              key={img.id}
              className="relative h-8 w-8 overflow-hidden rounded-sm border border-slate-200 bg-white shadow-sm"
              style={{
                zIndex: i,
                transform:
                  i === 0
                    ? "rotate(-5deg) translateY(2px)"
                    : i === 1
                    ? "rotate(5deg) translateY(-2px)"
                    : "rotate(0deg)",
              }}
            >
              <img
                src={img.src}
                alt={img.alt || "Group image"}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      );
    }

    // If text only
    const texts = children.filter((b) => b.type === "text");
    if (texts.length > 0) {
      return (
        <span className="max-w-[140px] truncate text-[11px] font-bold text-slate-400">
          {texts.length} Text Items
        </span>
      );
    }

    return (
      <div className="flex h-8 w-12 items-center justify-center rounded-sm border border-slate-300 bg-slate-100">
        <span className="text-[10px] font-bold text-slate-500">GRP</span>
      </div>
    );
  }

  if (block.type === "image") {
    return (
      <div className="h-8 w-12 overflow-hidden rounded-sm border border-slate-300 bg-slate-200">
        <img
          src={block.src}
          alt={block.alt || "Image layer"}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (block.type === "palette") {
    const colors = Array.isArray(block.colors) ? block.colors : [];
    return (
      <div className="flex items-center gap-1">
        {colors.slice(0, 4).map((color) => (
          <span
            key={color}
            className="h-4 w-4 rounded-full border border-white shadow-sm"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    );
  }

  if (block.type === "line") {
    return (
      <div className="flex h-4 w-12 items-center">
        <span className="h-[1px] w-full bg-slate-500" />
      </div>
    );
  }

  if (block.type === "text") {
    const label = getLayerLabel(block);
    return (
      <span className="max-w-[140px] truncate text-[12px] font-medium text-slate-400">
        {label}
      </span>
    );
  }

  const label = getLayerLabel(block);
  return (
    <span className="max-w-[140px] truncate text-[11px] text-slate-800">
      {label}
    </span>
  );
}

const PositionPanel = ({
  open,
  onClose,
  onArrange,
  onAlign,
  blocks = [],
  activeId,
  onSelectLayer,
  // orderedIdsFromTop: string[]
  onReorderLayers,
  allBlocks = [],
}) => {
  const [activeTab, setActiveTab] = useState("arrange"); // "arrange" | "layers"

  // Ref to the scrollable layers list container
  const listRef = useRef(null);

  // Scroll the active layer row into view whenever selection changes
  useEffect(() => {
    if (!open || activeTab !== "layers" || !activeId) return;

    const container = listRef.current;
    if (!container) return;

    const el = container.querySelector(`[data-layer-id="${activeId}"]`);
    if (!el || typeof el.scrollIntoView !== "function") return;

    el.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeId, activeTab, open]);

  if (!open) return null;

  // Top-most layer first (highest zIndex at top of list)
  const sortedLayers = [...blocks].sort(
    (a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0)
  );

  return (
    <div className="absolute -left-72 top-0 z-30 flex w-64 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Position</h2>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-slate-500 hover:bg-slate-100"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 text-xs font-medium">
        <button
          type="button"
          className={`rounded-full px-3 py-1 ${
            activeTab === "arrange"
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:bg-slate-100"
          }`}
          onClick={() => setActiveTab("arrange")}
        >
          Arrange
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-1 ${
            activeTab === "layers"
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:bg-slate-100"
          }`}
          onClick={() => setActiveTab("layers")}
        >
          Layers
        </button>
      </div>

      {/* ARRANGE TAB */}
      {activeTab === "arrange" && (
        <>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => onArrange("forward")}
              >
                Forward
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => onArrange("backward")}
              >
                Backward
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => onArrange("front")}
              >
                To front
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => onArrange("back")}
              >
                To back
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Align to page
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {["top", "middle", "bottom", "left", "center", "right"].map(
                (dir) => (
                  <button
                    key={dir}
                    type="button"
                    className="cursor-pointer rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50"
                    onClick={() => onAlign(dir)}
                  >
                    {dir.charAt(0).toUpperCase() + dir.slice(1)}
                  </button>
                )
              )}
            </div>
          </div>
        </>
      )}

      {/* LAYERS TAB */}
      {activeTab === "layers" && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Layers
            </p>
            <div className="mt-2 inline-flex rounded-full bg-slate-100 p-0.5 text-[11px]">
              <span className="rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm">
                All
              </span>
            </div>
          </div>

          {/* Framer Motion reorder list */}
          <Reorder.Group
            axis="y"
            layoutScroll
            values={sortedLayers}
            onReorder={(newItems) =>
              onReorderLayers?.(newItems.map((b) => b.id))
            }
            className="mt-1 max-h-72 space-y-2 overflow-y-auto pr-1"
            ref={listRef}
          >
            {sortedLayers.map((block) => {
              const isActive = block.id === activeId;

              const baseClasses =
                "flex w-full items-center rounded-xl border px-2 py-2 text-left text-xs cursor-pointer transition-colors";
              const activeClasses = "border-slate-900 bg-white";
              const inactiveClasses =
                "border-slate-200 bg-slate-50 hover:bg-slate-100";

              return (
                <Reorder.Item
                  key={block.id}
                  value={block}
                  as="button"
                  type="button"
                  onClick={() => onSelectLayer?.(block.id)}
                  className={`${baseClasses} ${
                    isActive ? activeClasses : inactiveClasses
                  }`}
                  whileDrag={{
                    scale: 1.02,
                    boxShadow: "0 10px 25px rgba(15,23,42,0.35)",
                    borderColor: "#a855f7",
                    backgroundColor: "#f5ecff",
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 32,
                    mass: 0.6,
                  }}
                  layout
                  data-layer-id={block.id}
                >
                  {/* Drag dots */}
                  <span className="mr-2 flex h-6 w-4 items-center justify-center text-[10px] text-slate-400">
                    ⋮⋮
                  </span>

                  <div className="relative flex flex-1 items-center justify-center">
                    {renderLayerPreview(block, allBlocks)}
                    <span className="absolute right-0 text-[14px] text-slate-400">
                      ⋯
                    </span>
                  </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        </div>
      )}
    </div>
  );
};

export default PositionPanel;
