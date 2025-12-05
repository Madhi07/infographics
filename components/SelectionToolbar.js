// SelectionToolbar.js
import React, { useState } from "react";

const SelectionToolbar = ({
  visible,
  x,
  y,
  blockType,
  onOpenPosition,
  opacity = 1,
  onChangeOpacity = () => {},
  onFlipHorizontal = () => {},
  onFlipVertical = () => {},
  borderRadius = 0,
  onChangeBorderRadius = () => {},

  // text props
  textAlign = "center",
  listType = "normal",
  onCycleTextAlign = () => {},
  onCycleListType = () => {},

  // NEW
  onCreateText = () => {},
  onChangeBackground = () => {},
  currentBackground = "",

  // text color props
  onChangeTextColor = () => {},
  textColor = "",
  currentTextColor = "",

  fontList = [], // array of {label, value}
  currentFontFamily = "", // string, e.g. "Roboto"
  onChangeFontFamily = () => {},
  currentFontSize = null,
  onChangeFontSize = () => {},
  onToggleBold = () => {},
  onToggleItalic = () => {},
  onToggleUnderline = () => {},
  onToggleStrike = () => {},
  currentBold = false,
  currentItalic = false,
  currentUnderline = false,
  currentStrike = false,

  // HISTORY (new)
  onUndo = () => {},
  onRedo = () => {},
  canUndo = false,
  canRedo = false,
}) => {
  const [openPanel, setOpenPanel] = useState(null);
  const [fontSearch, setFontSearch] = useState("");

  if (!visible) return null;

  const percentOpacity = Math.round(opacity * 100);
  const roundingValue = Math.round(borderRadius);

  const togglePanel = (panel) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const alignIconSrc = (align) => {
    switch (align) {
      case "left":
        return "/icons/align-left.png";
      case "right":
        return "/icons/align-right.png";
      case "justify":
        return "/icons/justify.png";
      case "center":
      default:
        return "/icons/center-align.png";
    }
  };

  const listIconSrc = (mode) => {
    switch (mode) {
      case "bullet":
        return "/icons/bullet-list.png";
      case "number":
        return "/icons/num-list.png";
      case "normal":
      default:
        return "/icons/bullet-list.png";
    }
  };

  // prefer currentTextColor (what index.js passes); fallback to textColor prop
  const effectiveTextColor = currentTextColor || textColor || "#000000";

  return (
    <div
      className="fixed z-[9999]"
      style={{ top: y, left: x, transform: "translate(-50%,0)" }}
    >
      <div className="relative inline-flex">
        {/* TOP TOOLBAR PILL */}
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-xl border border-slate-200">
          {/* Undo/Redo buttons (new) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (canUndo && typeof onUndo === "function") onUndo();
              }}
              disabled={!canUndo}
              aria-label="Undo (Ctrl/Cmd+Z)"
              title="Undo (Ctrl/Cmd+Z)"
              className={`p-1 rounded-md text-sm border flex items-center justify-center ${
                canUndo
                  ? "bg-white hover:bg-slate-50"
                  : "bg-gray-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              <img
                src="/icons/undo.png"
                alt="undo"
                className="h-4 w-4 object-contain"
                aria-hidden
              />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (canRedo && typeof onRedo === "function") onRedo();
              }}
              disabled={!canRedo}
              aria-label="Redo (Ctrl/Cmd+Y)"
              title="Redo (Ctrl/Cmd+Y)"
              className={`p-1 rounded-md text-sm border flex items-center justify-center ${
                canRedo
                  ? "bg-white hover:bg-slate-50"
                  : "bg-gray-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              <img
                src="/icons/redo.png"
                alt="redo"
                className="h-4 w-4 object-contain"
                aria-hidden
              />
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* FONT dropdown */}
          {blockType === "text" && fontList && fontList.length > 0 && (
            <>
              <div className="relative">
                {/* Button that shows current font and opens the popup */}
                <button
                  type="button"
                  onClick={() =>
                    setOpenPanel((p) => (p === "font" ? null : "font"))
                  }
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#f3f4f6] px-2 py-0.5 text-sm font-medium hover:bg-slate-50 cursor-pointer text-sm border-none"
                  title="Font family"
                  style={{ minWidth: 160 }}
                >
                  <span
                    className="truncate "
                    style={{ fontFamily: currentFontFamily || "inherit" }}
                  >
                    {/* show label or the raw family as fallback */}
                    {(() => {
                      const found = fontList.find(
                        (f) => f.value === currentFontFamily
                      );
                      return found
                        ? found.label
                        : currentFontFamily
                        ? currentFontFamily.split(",")[0]
                        : "Select Font Family";
                    })()}
                  </span>

                  <svg
                    className="h-4 w-4 shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {/* Popup panel */}
                {openPanel === "font" && (
                  <div
                    className="absolute left-0 top-[calc(100%+8px)] z-50 w-[260px] max-h-64 overflow-auto no-scrollbar rounded-2xl bg-white shadow-xl py-2 mt-1 -ml-13"
                    role="menu"
                  >
                    {/* optional search field */}
                    <div className="px-3 pb-2">
                      <input
                        type="text"
                        placeholder="Search fonts..."
                        value={fontSearch}
                        onChange={(e) => setFontSearch(e.target.value)}
                        className="w-full rounded border px-2 py-1 text-sm"
                      />
                    </div>

                    <div className="divide-y">
                      {fontList
                        .filter((f) =>
                          f.label
                            .toLowerCase()
                            .includes(fontSearch.toLowerCase())
                        )
                        .map((f) => (
                          <button
                            key={f.value}
                            type="button"
                            onClick={() => {
                              onChangeFontFamily(f.value);
                              setOpenPanel(null);
                              setFontSearch("");
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                            style={{ fontFamily: f.value }}
                          >
                            <div className="w-8 text-lg leading-none">Aa</div>
                            <div className="flex-1 truncate">{f.label}</div>
                          </button>
                        ))}

                      {fontList.filter((f) =>
                        f.label.toLowerCase().includes(fontSearch.toLowerCase())
                      ).length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-400">
                          No fonts found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-4 w-px bg-slate-200" />
            </>
          )}

          {blockType === "text" && (
            <>
              <label title="Font size" className="flex items-center gap-2">
                <select
                  aria-label="Font size"
                  value={currentFontSize ?? ""}
                  onChange={(e) => onChangeFontSize(Number(e.target.value))}
                  className="text-sm rounded-xl bg-[#f3f4f6] px-2 py-0.5 shadow-xl border-none"
                  style={{ width: 74 }}
                >
                  {/* optional placeholder */}
                  <option value="">Size</option>
                  {Array.from({ length: 68 / 2 + 1 }, (_, i) => 4 + i * 2).map(
                    (size) => (
                      <option key={size} value={size}>
                        {size}px
                      </option>
                    )
                  )}
                </select>
              </label>

              <div className="h-4 w-px bg-slate-200" />
            </>
          )}

          <div className="h-4 w-px bg-slate-200" />

          {/* FONT STYLE CONTROLS: Bold / Italic / Underline / Strike */}
          {blockType === "text" && (
            <>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Bold"
                  onClick={() => onToggleBold && onToggleBold()}
                  className={`p-1 rounded px-2 hover:bg-slate-50 ${
                    currentBold ? "bg-slate-100" : ""
                  }`}
                >
                  <span className="font-bold">B</span>
                </button>

                <button
                  type="button"
                  title="Italic"
                  onClick={() => onToggleItalic && onToggleItalic()}
                  className={`p-1 rounded px-2 hover:bg-slate-50 ${
                    currentItalic ? "bg-slate-100" : ""
                  }`}
                >
                  <span className="italic">I</span>
                </button>

                <button
                  type="button"
                  title="Underline"
                  onClick={() => onToggleUnderline && onToggleUnderline()}
                  className={`p-1 rounded px-2 hover:bg-slate-50 ${
                    currentUnderline ? "bg-slate-100" : ""
                  }`}
                >
                  <span className="underline">U</span>
                </button>

                <button
                  type="button"
                  title="Strikethrough"
                  onClick={() => onToggleStrike && onToggleStrike()}
                  className={`p-1 rounded px-2 hover:bg-slate-50 ${
                    currentStrike ? "bg-slate-100" : ""
                  }`}
                >
                  <span className="line-through">S</span>
                </button>
              </div>

              <div className="h-4 w-px bg-slate-200" />
            </>
          )}

          {/* Position */}
          <button
            className="p-1 hover:bg-slate-100 rounded flex items-center text-sm"
            type="button"
            onClick={onOpenPosition}
          >
            Position
          </button>
          <div className="h-4 w-px bg-slate-200" />

          {/* FLIP — ONLY for images */}
          {blockType === "image" && (
            <>
              <button
                className="p-1 hover:bg-slate-100 rounded flex items-center text-sm"
                type="button"
                onClick={() => togglePanel("flip")}
              >
                Flip
              </button>

              <div className="h-4 w-px bg-slate-200" />
            </>
          )}

          {/* ROUNDING — ONLY for images */}
          {blockType === "image" && (
            <>
              <button
                className="p-1 hover:bg-slate-100 rounded flex items-center"
                type="button"
                onClick={() => togglePanel("rounding")}
                title="Corner rounding"
              >
                <img
                  src="/icons/rounding.png"
                  className="h-4 w-4"
                  alt="rounding"
                />
              </button>

              <div className="h-4 w-px bg-slate-200" />
            </>
          )}

          {/* Transparency */}
          <button
            className="p-1 hover:bg-slate-100 rounded flex items-center"
            type="button"
            onClick={() => togglePanel("transparency")}
            title="Transparency"
          >
            <img
              src="/icons/transparent.png"
              className="min-h-4 min-w-4 max-w-4 max-h-4"
              alt="transparency"
            />
          </button>

          {/* TEXT CONTROLS (existing) */}
          {blockType === "text" && (
            <>
              <div className="h-4 w-px bg-slate-200" />

              {/* Alignment cycle button */}
              <button
                type="button"
                onClick={() => onCycleTextAlign()}
                title={`Text align: ${textAlign || "center"}`}
                className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50"
              >
                <img
                  src={alignIconSrc(textAlign)}
                  alt={`align-${textAlign}`}
                  className="min-h-4 min-w-4 object-contain"
                />
              </button>

              {/* List cycle button */}
              <button
                type="button"
                onClick={() => onCycleListType()}
                title={`List: ${listType || "normal"}`}
                className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50"
              >
                <img
                  src={listIconSrc(listType)}
                  alt={`list-${listType}`}
                  className="min-h-4 min-w-4 object-contain"
                />
              </button>
            </>
          )}

          {/* Divider */}
          <div className="h-4 w-px bg-slate-200" />

          {/* NEW: Background color picker (native) */}
          <label
            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50 cursor-pointer"
            title="Background color"
          >
            <span className="text-xs select-none">BG</span>

            {/* preview swatch */}
            <span
              className="inline-block w-5 h-5 rounded border"
              style={{ background: currentBackground || "transparent" }}
            />

            {/* native color input hidden visually but clickable via label */}
            <input
              type="color"
              value={currentBackground || "#ffffff"}
              onChange={(e) => onChangeBackground(e.target.value)}
              className="sr-only"
              aria-label="Choose background color"
            />
          </label>
          <div className="h-4 w-px bg-slate-200" />

          {/* TEXT COLOR PICKER (NEW) */}
          {blockType === "text" && (
            <>
              <label
                className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50 cursor-pointer"
                title="Text color"
              >
                <span className="text-xs select-none">A</span>

                {/* preview swatch */}
                <span
                  className="inline-block w-5 h-5 rounded border"
                  style={{ background: effectiveTextColor }}
                />
                <input
                  type="color"
                  value={effectiveTextColor}
                  onChange={(e) => onChangeTextColor(e.target.value)}
                  className="sr-only"
                  aria-label="Choose text color"
                />
              </label>
              <div className="h-4 w-px bg-slate-200" />
            </>
          )}

          {/* New text button */}
          <button
            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-50 text-sm"
            type="button"
            title="Add text box"
            onClick={onCreateText}
          >
            <span className="inline-flex items-center justify-center rounded bg-[#f3f4f6] px-2 py-0.5 text-sm font-medium">
              T+
            </span>
          </button>
        </div>

        {/* PANELS */}
        {/* Transparency Panel */}
        {openPanel === "transparency" && (
          <div className="absolute left-1/2 top-[calc(100%+8px)] w-64 -translate-x-1/2 rounded-2xl bg-white shadow-xl border p-3">
            <div className="text-sm font-medium mb-3">Transparency</div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={percentOpacity}
                onChange={(e) => onChangeOpacity(Number(e.target.value) / 100)}
                className="flex-1 accent-[#a855f7]"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={percentOpacity}
                onChange={(e) => onChangeOpacity(Number(e.target.value) / 100)}
                className="w-12 rounded border px-2 py-1 text-xs text-center"
              />
            </div>
          </div>
        )}

        {/* Flip panel — only for images */}
        {openPanel === "flip" && blockType === "image" && (
          <div className="absolute left-1/2 top-[calc(100%+8px)] w-56 -translate-x-1/2 rounded-2xl bg-white shadow-xl border py-2">
            <button
              className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"
              onClick={onFlipHorizontal}
            >
              <img
                src="/icons/horizontal-flip.png"
                className="h-4 w-4"
                alt="flip-h"
              />
              Flip horizontal
            </button>

            <button
              className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"
              onClick={onFlipVertical}
            >
              <img
                src="/icons/vertical-flip.png"
                className="h-4 w-4"
                alt="flip-v"
              />
              Flip vertical
            </button>
          </div>
        )}

        {/* Rounding panel — only for images */}
        {openPanel === "rounding" && blockType === "image" && (
          <div className="absolute left-1/2 top-[calc(100%+8px)] w-64 -translate-x-1/2 rounded-2xl bg-white shadow-xl border p-3">
            <div className="text-sm font-medium mb-3">Corner rounding</div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={roundingValue}
                onChange={(e) => onChangeBorderRadius(Number(e.target.value))}
                className="flex-1 accent-[#a855f7]"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={roundingValue}
                onChange={(e) => onChangeBorderRadius(Number(e.target.value))}
                className="w-12 rounded border px-2 py-1 text-xs text-center"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectionToolbar;
