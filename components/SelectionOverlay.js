// SelectionOverlay.js
import Image from "next/image";

const hasNumericSize = (block) =>
  block &&
  block.size &&
  typeof block.size.width === "number" &&
  typeof block.size.height === "number";

function estimateUnrotatedSizeFromAABB(activeRect, rotationDeg) {
  if (!activeRect) return { ok: false };
  const theta = (Math.abs(rotationDeg || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  const D = c * c - s * s;
  if (Math.abs(D) < 1e-4) return { ok: false };
  const W = activeRect.width;
  const H = activeRect.height;
  const w = (c * W - s * H) / D;
  const h = (-s * W + c * H) / D;
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return { ok: false };
  return { ok: true, width: w, height: h };
}

const SelectionOverlay = ({
  block,
  canvasRect,
  activeRect,
  canResize,
  cornerHandles = [],
  sideHandles = [],
  beginInteraction,
  cropInsets = {},
  onSelect = () => {}, // NEW: called when overlay is clicked (useful for selecting groups)
}) => {
  if (!block || !canvasRect) return null;

  const isGroup = Array.isArray(block.blockIds) && block.blockIds.length > 0;

  const crop = {
    top: cropInsets.top ?? 0,
    right: cropInsets.right ?? 0,
    bottom: cropInsets.bottom ?? 0,
    left: cropInsets.left ?? 0,
  };

  const usingActiveRect = !!activeRect;
  const rotation = typeof block.rotation === "number" ? block.rotation : 0;
  const flipH = !!block.flipH;
  const flipV = !!block.flipV;

  // compute viewport top-left
  const rectLeft = usingActiveRect
    ? activeRect.left
    : canvasRect.left + (block.position?.x || 0);
  const rectTop = usingActiveRect
    ? activeRect.top
    : canvasRect.top + (block.position?.y || 0);

  let width = 0;
  let height = 0;
  let shouldApplyTransforms = false;

  if (hasNumericSize(block)) {
    width = block.size.width;
    height = block.size.height;
    shouldApplyTransforms = true;
  } else if (usingActiveRect) {
    const est = estimateUnrotatedSizeFromAABB(activeRect, rotation);
    if (est.ok) {
      width = est.width;
      height = est.height;
      shouldApplyTransforms = true;
    } else {
      width = activeRect.width;
      height = activeRect.height;
      shouldApplyTransforms = false;
    }
  } else {
    width = hasNumericSize(block) ? block.size.width : 0;
    height = hasNumericSize(block) ? block.size.height : 0;
    shouldApplyTransforms = Boolean(hasNumericSize(block));
  }
  const TEXT_OVERLAY_PADDING = 8;
  if (block.type === "text") {
    width += TEXT_OVERLAY_PADDING * 2;
    height += TEXT_OVERLAY_PADDING * 2;
  }

  const centerX =
    rectLeft + (usingActiveRect ? activeRect.width / 2 : width / 2);
  const centerY =
    rectTop + (usingActiveRect ? activeRect.height / 2 : height / 2);

  const transforms = [];
  if (shouldApplyTransforms) {
    if (rotation) transforms.push(`rotate(${rotation}deg)`);
    if (flipH) transforms.push("scaleX(-1)");
    if (flipV) transforms.push("scaleY(-1)");
  }
  

  const wrapperStyle = {
    position: "fixed",
    left: centerX,
    top: centerY,
    width,
    height,
    transform:
      transforms.length > 0
        ? `translate(-50%, -50%) ${transforms.join(" ")}`
        : `translate(-50%, -50%)`,
    transformOrigin: "center center",
    // IMPORTANT: group overlay must capture pointer events so it doesn't fall through
    pointerEvents: isGroup ? "auto" : "none",
    zIndex: 9999,
  };

  const innerCropStyle = {
    top: `${crop.top}%`,
    right: `${crop.right}%`,
    bottom: `${crop.bottom}%`,
    left: `${crop.left}%`,
  };

  // border style for group vs single
  const borderStyle = isGroup
    ? {
        borderStyle: "dashed",
        borderWidth: 2,
        borderColor: "#a855f7",
        borderRadius: 6,
      }
    : {
        borderStyle: "solid",
        borderWidth: 1,
        borderColor: "#a855f7",
        borderRadius: 0,
      };

  // handle classes
  const cornerHandleClass = isGroup
    ? "h-4 w-4 rounded-full bg-white border-2 border-[#a855f7]"
    : "h-3 w-3 rounded-full border-2 border-white bg-[#a855f7]";
  const sideHandleBase = isGroup
    ? "bg-white border-2 border-[#a855f7]"
    : "bg-[#a855f7] border border-white";

  return (
    <div style={wrapperStyle}>
      <div className="absolute inset-0" style={innerCropStyle}>
        <div className="relative h-full w-full">
          {/* dashed/solid border */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={borderStyle}
          />

          {/* FULL-SIZE transparent grab area (only for groups) */}
          {isGroup && (
            <div
              // cover interior to capture clicks & drags for the entire group
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                cursor: "move",
                // invisible but captures events
                background: "transparent",
              }}
              onPointerDown={(e) => {
                // start group move
                e.stopPropagation();
                beginInteraction(e, "move", block.id);
              }}
              onClick={(e) => {
                // select the group (without starting a move)
                e.stopPropagation();
                onSelect(block.id);
              }}
            />
          )}

          {/* Resize / corner handles (visible and pointer-enabled) */}
          {canResize &&
            cornerHandles.map((handle) => (
              <button
                key={handle.id}
                type="button"
                aria-label={`${handle.interaction} via ${handle.id}`}
                className={`absolute ${cornerHandleClass} ${
                  handle.className || ""
                }`}
                style={{
                  transform: handle.transform || undefined,
                  pointerEvents: "auto",
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  // resize of group may not be supported — but call beginInteraction anyway
                  beginInteraction(event, handle.interaction, block.id, {
                    handle: handle.id,
                  });
                }}
              />
            ))}

          {canResize &&
            sideHandles.map((handle) => {
              const isVertical = handle.id === "left" || handle.id === "right";
              const base = isVertical
                ? isGroup
                  ? "h-6 w-3 rounded-full"
                  : "h-6 w-2 rounded-full"
                : isGroup
                ? "h-3 w-10 rounded-full"
                : "h-2 w-6 rounded-full";
              return (
                <button
                  key={handle.id}
                  type="button"
                  aria-label={`${handle.interaction} via ${handle.id}`}
                  className={`absolute ${base} ${sideHandleBase} ${
                    handle.className || ""
                  }`}
                  style={{ pointerEvents: "auto" }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    beginInteraction(event, handle.interaction, block.id, {
                      handle: handle.id,
                    });
                  }}
                />
              );
            })}

          {/* rotate + move toolbar (below) - still pointer-events-auto */}
          <div className="absolute left-1/2 top-[117%] mt-3 flex -translate-x-1/2 gap-2 pointer-events-none">
            <button
              type="button"
              aria-label="Rotate element"
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow"
              onPointerDown={(event) => {
                event.stopPropagation();
                beginInteraction(event, "rotate", block.id);
              }}
            >
              <Image
                src="/icons/rotation.png"
                alt="Rotate"
                width={16}
                height={16}
                className="h-4 w-4 object-contain cursor-pointer"
              />
            </button>

            <button
              type="button"
              aria-label="Move element"
              className="pointer-events-auto cursor-pointer flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow"
              onPointerDown={(event) => {
                event.stopPropagation();
                beginInteraction(event, "move", block.id);
              }}
            >
              <Image
                src="/icons/drag.png"
                alt="Move"
                width={16}
                height={16}
                className="h-4 w-4 object-contain"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectionOverlay;
