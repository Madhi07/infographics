// /stores/commands.js
// Functional (factory) commands for InfographicsStore.
// Each exported function returns a command object: { do(store), undo(store) }.

// Helper utilities
function clone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (err) {
    return structuredClone
      ? structuredClone(v)
      : Array.isArray(v)
      ? v.slice()
      : Object.assign({}, v);
  }
}
function genId(prefix = "b") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/* -------------------------
   MoveCommand — single block
   ------------------------- */
export function MoveCommand(blockId, oldPos, newPos) {
  const oldP = clone(oldPos);
  const newP = clone(newPos);
  return {
    do(store) {
      store.updateBlock(blockId, { position: newP });
    },
    undo(store) {
      store.updateBlock(blockId, { position: oldP });
    },
  };
}

/* -------------------------
   ResizeCommand — size +/- position + text fontSize scaling
   payload: { blockId, oldSize, newSize, oldPos?, newPos?, oldFontSize?, newFontSize? }
   ------------------------- */
export function ResizeCommand({
  blockId,
  oldSize,
  newSize,
  oldPos = null,
  newPos = null,
  oldFontSize = null,
  newFontSize = null,
}) {
  const oldS = clone(oldSize);
  const newS = clone(newSize);
  const oldP = oldPos ? clone(oldPos) : null;
  const newP = newPos ? clone(newPos) : null;

  return {
    do(store) {
      const patch = { size: newS };
      if (newP) patch.position = newP;
      if (newFontSize !== null && typeof newFontSize !== "undefined")
        patch.fontSize = newFontSize;
      store.updateBlock(blockId, patch);
    },
    undo(store) {
      const patch = { size: oldS };
      if (oldP) patch.position = oldP;
      if (oldFontSize !== null && typeof oldFontSize !== "undefined")
        patch.fontSize = oldFontSize;
      store.updateBlock(blockId, patch);
    },
  };
}

/* -------------------------
   RotateCommand — rotation (single or group-aware)
   Accepts: { blockId, oldRotation, newRotation, childOld?, childNew? }
   ------------------------- */
export function RotateCommand({
  blockId,
  oldRotation,
  newRotation,
  childOld = null,
  childNew = null,
}) {
  const oldR = oldRotation;
  const newR = newRotation;
  const childOldCloned = childOld ? clone(childOld) : null;
  const childNewCloned = childNew ? clone(childNew) : null;

  return {
    do(store) {
      store.updateBlock(blockId, { rotation: newR });
      if (childNewCloned) {
        Object.entries(childNewCloned).forEach(([id, patch]) => {
          store.updateBlock(id, clone(patch));
        });
      }
    },
    undo(store) {
      store.updateBlock(blockId, { rotation: oldR });
      if (childOldCloned) {
        Object.entries(childOldCloned).forEach(([id, patch]) => {
          store.updateBlock(id, clone(patch));
        });
      }
    },
  };
}

/* -------------------------
   CropCommand
   ------------------------- */
export function CropCommand(blockId, oldCrop = {}, newCrop = {}) {
  const oldC = clone(oldCrop || {});
  const newC = clone(newCrop || {});
  return {
    do(store) {
      store.updateBlock(blockId, { crop: newC });
    },
    undo(store) {
      store.updateBlock(blockId, { crop: oldC });
    },
  };
}

// AddBlockCommand — functional factory
// Accepts either a full createdBlock (with id) or a partial block object to be created.
// pageId optional - defaults to store.activePageId
export function AddBlockCommand({ pageId = null, createdBlock = null }) {
  // clone input so command is self-contained
  let created = createdBlock ? JSON.parse(JSON.stringify(createdBlock)) : null;
  let createdId = created?.id ?? null;

  return {
    do(store) {
      // determine page
      const pid = pageId ?? store.activePageId;
      const pIndex = store.project.pages.findIndex((p) => p.id === pid);
      if (pIndex === -1) {
        // fallback: attach to activePage if available
        return;
      }

      // create block if not provided
      if (!created) {
        created = {
          id: `b-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          // you may want to ensure required minimal fields; caller usually provides them
        };
        createdId = created.id;
      } else if (!createdId) {
        createdId = created.id = `b-${Date.now()}-${Math.floor(
          Math.random() * 100000
        )}`;
      }

      // append block (preserve immutability pattern used elsewhere)
      const page = store.project.pages[pIndex];
      page.blocks = [
        ...(page.blocks || []),
        JSON.parse(JSON.stringify(created)),
      ];
    },

    undo(store) {
      // remove the block from whichever page it lives on (safest)
      const page =
        store.findPageContainingBlock?.(createdId) ||
        store.project.pages.find(
          (p) => p.id === (pageId ?? store.activePageId)
        );
      if (!page) return;
      page.blocks = (page.blocks || []).filter((b) => b.id !== createdId);
    },
  };
}

/* -------------------------
   TextChangeCommand
   ------------------------- */
export function TextChangeCommand(blockId, oldPatch = {}, newPatch = {}) {
  const oldP = clone(oldPatch || {});
  const newP = clone(newPatch || {});
  return {
    do(store) {
      store.updateBlock(blockId, newP);
    },
    undo(store) {
      store.updateBlock(blockId, oldP);
    },
  };
}

/* -------------------------
   LockUnlockCommand
   ------------------------- */
export function LockUnlockCommand(blockId, oldLocked, newLocked) {
  const oldL = !!oldLocked;
  const newL = !!newLocked;
  return {
    do(store) {
      store.updateBlock(blockId, { locked: newL });
    },
    undo(store) {
      store.updateBlock(blockId, { locked: oldL });
    },
  };
}

/* -------------------------
   DuplicateCommand — duplicate a block (creates a new block on same page)
   Accepts: { pageId, createdBlock, originalBlock }
   ------------------------- */
export function DuplicateCommand({
  pageId = null,
  createdBlock = null,
  originalBlock = null,
}) {
  if (!createdBlock && !originalBlock)
    throw new Error(
      "DuplicateCommand: must provide createdBlock or originalBlock"
    );
  let created = createdBlock ? clone(createdBlock) : null;
  const orig = originalBlock ? clone(originalBlock) : null;
  let createdId = created?.id ?? null;

  return {
    do(store) {
      const pid = pageId ?? store.activePageId;
      const page = store.project.pages.find((p) => p.id === pid);
      if (!page) return;

      if (!created) {
        const copy = clone(orig);
        copy.id = genId("b");
        if (copy.position)
          copy.position = {
            x: (copy.position.x || 0) + 12,
            y: (copy.position.y || 0) + 12,
          };
        created = copy;
        createdId = copy.id;
      }

      // push to page.blocks
      const pIdx = store.project.pages.findIndex((p) => p.id === pid);
      if (pIdx === -1) return;
      store.project.pages[pIdx].blocks = [
        ...store.project.pages[pIdx].blocks,
        clone(created),
      ];
    },
    undo(store) {
      const pid = pageId ?? store.activePageId;
      const page = store.project.pages.find((p) => p.id === pid);
      if (!page) return;
      page.blocks = page.blocks.filter((b) => b.id !== createdId);
    },
  };
}

/* -------------------------
   DeleteBlockCommand — remove block (store old block so it can be restored)
   ------------------------- */
export function DeleteBlockCommand(blockId) {
  let oldBlock = null;
  let oldIndex = -1;
  let pageId = null;

  return {
    do(store) {
      const page = store.findPageContainingBlock(blockId) || store.activePage;
      if (!page) return;
      pageId = page.id;
      const idx = page.blocks.findIndex((b) => b.id === blockId);
      if (idx === -1) return;
      oldIndex = idx;
      oldBlock = clone(page.blocks[idx]);
      // remove
      page.blocks = page.blocks.filter((b) => b.id !== blockId);
      // clean group refs
      if (typeof store.ensureGroupRemovedForBlock === "function") {
        store.ensureGroupRemovedForBlock(blockId);
      }
    },
    undo(store) {
      const page =
        store.project.pages.find((p) => p.id === pageId) ?? store.activePage;
      if (!page || !oldBlock) return;
      const blocks = page.blocks.slice();
      blocks.splice(oldIndex, 0, oldBlock);
      page.blocks = blocks;
    },
  };
}

/* -------------------------
   GroupCommand — create/assign groupId to blocks and optionally create store group meta
   Accepts: (groupId, blockIds, groupMeta?) where groupMeta can include position/size/rotation/meta
   ------------------------- */
export function GroupCommand(groupId, blockIds = [], groupMeta = null) {
  const ids = clone(blockIds || []);
  let oldGroups = null;
  let createdGroup = false;

  return {
    do(store) {
      // capture old groupId per block
      oldGroups = {};
      const page = store.activePage;
      page.blocks = page.blocks.map((b) => {
        if (ids.includes(b.id)) {
          oldGroups[b.id] = b.groupId;
          return { ...b, groupId };
        }
        return b;
      });

      // create group metadata if not exists
      const existing = store.getGroupById?.(groupId);
      if (!existing) {
        createdGroup = true;
        const meta = groupMeta ?? { childIds: ids };
        store.addGroup({
          id: groupId,
          childIds: ids,
          position: meta.position ?? { x: 0, y: 0 },
          size: meta.size ?? { width: 0, height: 0 },
          rotation: meta.rotation ?? 0,
          meta: meta.meta ?? {},
        });
      } else {
        // ensure group knows childIds (merge unique)
        const newChildIds = Array.from(
          new Set([...(existing.childIds || []), ...ids])
        );
        store.updateGroup(existing.id, { childIds: newChildIds });
      }
    },
    undo(store) {
      // restore old block.groupId
      const page = store.activePage;
      page.blocks = page.blocks.map((b) => {
        if (ids.includes(b.id)) {
          return { ...b, groupId: oldGroups?.[b.id] };
        }
        return b;
      });

      if (createdGroup) {
        store.removeGroup(groupId);
      } else {
        // remove added childIds from existing group (if we merged)
        const g = store.getGroupById(groupId);
        if (g) {
          g.childIds = (g.childIds || []).filter((id) => !ids.includes(id));
        }
      }
    },
  };
}

/* -------------------------
   UngroupCommand — remove group
   Accepts: (groupId, blockIdsToUngroup?) - if blockIds not provided, ungroup all in group
   ------------------------- */
export function UngroupCommand(groupId, blockIds = null) {
  let oldGroups = null;
  let removedGroup = false;
  let oldGroupSnapshot = null;

  return {
    do(store) {
      oldGroups = {};
      const page = store.activePage;

      // determine targets
      const g = store.getGroupById(groupId);
      const targets =
        Array.isArray(blockIds) && blockIds.length
          ? blockIds
          : g?.childIds ?? [];

      page.blocks = page.blocks.map((b) => {
        if (targets.includes(b.id) || b.groupId === groupId) {
          oldGroups[b.id] = b.groupId;
          return { ...b, groupId: undefined };
        }
        return b;
      });

      if (g) {
        oldGroupSnapshot = clone(g);
        // if blockIds specified, remove them from group; else remove entire group
        if (Array.isArray(blockIds) && blockIds.length) {
          const remaining = (g.childIds || []).filter(
            (id) => !blockIds.includes(id)
          );
          store.updateGroup(groupId, { childIds: remaining });
        } else {
          removedGroup = true;
          store.removeGroup(groupId);
        }
      }
    },
    undo(store) {
      const page = store.activePage;
      page.blocks = page.blocks.map((b) => {
        if (oldGroups && oldGroups.hasOwnProperty(b.id)) {
          return { ...b, groupId: oldGroups[b.id] };
        }
        return b;
      });

      if (removedGroup && oldGroupSnapshot) {
        store.addGroup(oldGroupSnapshot);
      } else if (oldGroupSnapshot) {
        // if we partially removed childIds, restore full snapshot
        store.updateGroup(groupId, {
          childIds: oldGroupSnapshot.childIds ?? [],
        });
      }
    },
  };
}

/* -------------------------
   GroupTransformCommand — atomic transform of group + children
   Accepts: (groupId, groupBefore, groupAfter, childBeforeMap, childAfterMap)
   child maps: { blockId: { position?, rotation?, size?, fontSize? } }
   ------------------------- */
export function GroupTransformCommand(
  groupId,
  groupBefore = null,
  groupAfter = null,
  childBefore = {},
  childAfter = {}
) {
  const gb = clone(groupBefore);
  const ga = clone(groupAfter);
  const cb = clone(childBefore || {});
  const ca = clone(childAfter || {});

  return {
    do(store) {
      if (ga && typeof store.updateGroup === "function") {
        store.updateGroup(groupId, ga);
      } else if (ga && typeof store.getGroupById === "function") {
        const g = store.getGroupById(groupId);
        if (g) Object.assign(g, ga);
      }

      Object.entries(ca).forEach(([id, patch]) => {
        store.updateBlock(id, clone(patch));
      });
    },
    undo(store) {
      if (gb && typeof store.updateGroup === "function") {
        store.updateGroup(groupId, gb);
      } else if (gb && typeof store.getGroupById === "function") {
        const g = store.getGroupById(groupId);
        if (g) Object.assign(g, gb);
      }

      Object.entries(cb).forEach(([id, patch]) => {
        store.updateBlock(id, clone(patch));
      });
    },
  };
}

/* -------------------------
   ZIndexCommand
   ------------------------- */
export function ZIndexCommand(oldMap = {}, newMap = {}) {
  const o = clone(oldMap || {});
  const n = clone(newMap || {});
  return {
    do(store) {
      Object.entries(n).forEach(([id, z]) =>
        store.updateBlock(id, { zIndex: z })
      );
    },
    undo(store) {
      Object.entries(o).forEach(([id, z]) =>
        store.updateBlock(id, { zIndex: z })
      );
    },
  };
}

/* -------------------------
   Page commands: AddPageCommand / RemovePageCommand
   ------------------------- */
export function AddPageCommand(newPage = null) {
  const page = newPage
    ? clone(newPage)
    : { id: `page-${Date.now()}`, title: "Page", blocks: [] };
  let index = null;
  return {
    do(store) {
      store.project.pages.push(clone(page));
      index = store.project.pages.length - 1;
    },
    undo(store) {
      if (typeof index === "number") {
        store.project.pages.splice(index, 1);
      } else {
        store.project.pages = store.project.pages.filter(
          (p) => p.id !== page.id
        );
      }
    },
  };
}

export function RemovePageCommand(pageId) {
  let oldPage = null;
  let oldIndex = -1;
  return {
    do(store) {
      const idx = store.project.pages.findIndex((p) => p.id === pageId);
      if (idx === -1) return;
      oldIndex = idx;
      oldPage = clone(store.project.pages[idx]);
      store.project.pages.splice(idx, 1);
    },
    undo(store) {
      if (!oldPage) return;
      const pages = store.project.pages.slice();
      pages.splice(oldIndex, 0, oldPage);
      store.project.pages = pages;
    },
  };
}

/* -------------------------
   SetBackgroundCommand
   ------------------------- */
export function SetBackgroundCommand(
  targetType /* "block"|"page" */,
  targetId,
  oldValue,
  newValue
) {
  const t = targetType;
  const tid = targetId;
  const oldV = clone(oldValue);
  const newV = clone(newValue);

  return {
    do(store) {
      if (t === "block") {
        store.updateBlock(tid, { background: newV });
      } else if (t === "page") {
        const page =
          store.project.pages.find((p) => p.id === tid) || store.activePage;
        if (page) page.background = newV;
      }
    },
    undo(store) {
      if (t === "block") {
        store.updateBlock(tid, { background: oldV });
      } else if (t === "page") {
        const page =
          store.project.pages.find((p) => p.id === tid) || store.activePage;
        if (page) page.background = oldV;
      }
    },
  };
}
