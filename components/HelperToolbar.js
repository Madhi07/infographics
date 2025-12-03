// HelperToolbar.js
import React from "react";

const HelperToolbar = ({
  visible,
  x,
  y,
  locked,
  onLock,
  onDuplicate,
  onDelete,

  // grouping props
  canGroup,
  onGroup,
  canUngroup,
  onUngroup,
}) => {
  if (!visible) return null;

  return (
    <div
      className="fixed z-[9999] flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-xl border border-slate-200"
      style={{
        top: y - 50,
        left: x,
        transform: "translate(-50%, 0)",
      }}
    >
      {/* Lock / Unlock */}
      <button
        className="p-1 hover:bg-slate-100 rounded"
        onClick={onLock}
        type="button"
      >
        <img
          src={locked ? "/icons/lock.png" : "/icons/unlock.png"}
          alt="Lock"
          className="h-4 w-4"
        />
      </button>

      {!locked && (
        <>
          {/* Duplicate */}
          <button
            className="p-1 hover:bg-slate-100 rounded"
            onClick={onDuplicate}
            type="button"
          >
            <img
              src="/icons/duplicate.png"
              alt="Duplicate"
              className="h-4 w-4"
            />
          </button>

          {/* Delete */}
          <button
            className="p-1 hover:bg-red-50 rounded text-red-600"
            onClick={onDelete}
            type="button"
          >
            <img src="/icons/bin.png" alt="Delete" className="h-4 w-4" />
          </button>

          {/* Separator */}
          <div className="h-4 w-px bg-slate-200" />

          {/* Group / Ungroup */}
          {canGroup && (
            <button
              className="p-1 hover:bg-slate-100 rounded flex items-center gap-2 text-sm"
              onClick={onGroup}
              type="button"
            >
              <span>Group</span>
            </button>
          )}

          {canUngroup && (
            <button
              className="p-1 hover:bg-slate-100 rounded flex items-center gap-2 text-sm"
              onClick={onUngroup}
              type="button"
            >
              <span>Ungroup</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default HelperToolbar;
