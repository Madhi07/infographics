// /stores/InfographicsStore.js
import { makeAutoObservable } from "mobx";

/**
 * Functional (factory) MobX store for Infographics editor.
 * - Use `const store = createInfographicsStore(initialProject)`
 * - store is auto-bound (methods keep `this` via makeAutoObservable autoBind)
 *
 * API highlights:
 * - store.project, store.activePageId, store.groups
 * - store.updateBlock(id, patch)
 * - store.updateGroup(id, patch)
 * - store.addGroup(group), store.removeGroup(id)
 * - store.applyCommand(cmd), store.undo(), store.redo()
 * - store.ensureGroupRemovedForBlock(blockId)
 */

function deepClone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    // fallback shallow
    return typeof structuredClone === "function"
      ? structuredClone(v)
      : Object.assign({}, v);
  }
}

function genId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function createInfographicsStore(initialProject = { pages: [] }) {
  // normalize minimal project shape
  const project = deepClone(initialProject) || { pages: [] };
  const store = {
    // observable state
    project,
    activePageId: project.activePageId ?? project.pages[0]?.id ?? null,
    undoStack: [],
    redoStack: [],

    // groups array: each group { id, childIds: [], position, size, rotation, meta }
    groups: [],

    // ===== non-observable DOM refs (pageId -> { blockId: element }) =====
    // this should NOT be observable; it's a plain JS object to store DOM nodes
    blockRefs: {},

    // attach / detach DOM elements for blocks
    setBlockRef(pageId, blockId, el) {
      if (!pageId || !blockId) return;
      if (!this.blockRefs[pageId]) this.blockRefs[pageId] = {};
      if (el) {
        this.blockRefs[pageId][blockId] = el;
      } else {
        // allow clearing a ref by passing null/undefined
        if (this.blockRefs[pageId]) {
          delete this.blockRefs[pageId][blockId];
          if (Object.keys(this.blockRefs[pageId]).length === 0)
            delete this.blockRefs[pageId];
        }
      }
    },

    getBlockRef(pageId, blockId) {
      return (
        (this.blockRefs[pageId] && this.blockRefs[pageId][blockId]) || null
      );
    },

    // ========== derived getters ==========
    get activePage() {
      return (
        this.project?.pages?.find((p) => p.id === this.activePageId) ?? null
      );
    },

    get blocks() {
      return this.activePage?.blocks ?? [];
    },

    // helper: find a block by id anywhere in project
    getBlockById(id) {
      if (!this.project?.pages) return null;
      for (const p of this.project.pages) {
        if (!p.blocks) continue;
        const b = p.blocks.find((blk) => blk.id === id);
        if (b) return b;
      }
      return null;
    },

    // find page that contains block id (useful for create/delete)
    findPageContainingBlock(blockId) {
      if (!this.project?.pages) return null;
      return (
        this.project.pages.find((p) =>
          p.blocks?.some((b) => b.id === blockId)
        ) ?? null
      );
    },

    // ========== page helpers ==========
    setActivePage(pageId) {
      this.activePageId = pageId;
    },

    setBlocks(newBlocks) {
      const page = this.activePage;
      if (!page) return;
      page.blocks = newBlocks;
    },

    replaceProject(newProject) {
      this.project = deepClone(newProject);
      this.activePageId =
        this.project.activePageId ??
        this.project.pages[0]?.id ??
        this.activePageId;
    },

    // ========== block API (used by commands & UI live updates) ==========
    updateBlock(id, patch = {}) {
      const b = this.getBlockById(id);
      if (!b) return;
      Object.assign(b, patch);
    },

    // add a block to a page (pageId optional -> active page)
    addBlockToPage(block, pageId = null) {
      const pid = pageId ?? this.activePageId;
      const page = this.project.pages.find((p) => p.id === pid);
      if (!page) return null;
      const b = deepClone(block);
      if (!b.id) b.id = genId("b");
      page.blocks = [...page.blocks, b];
      return b;
    },

    removeBlock(blockId) {
      const page = this.findPageContainingBlock(blockId) || this.activePage;
      if (!page) return;
      page.blocks = page.blocks.filter((b) => b.id !== blockId);
      // ensure groups cleaned
      this.ensureGroupRemovedForBlock(blockId);
    },

    // groups: [{ id, childIds:[], blockIds:[], position:{x,y}, size:{width,height}, rotation, meta, blockOffsets }]
    addGroup(group) {
      const g = {
        id: group.id ?? genId("group"),
        // normalize both naming variants to an array copy
        childIds: Array.isArray(group.childIds)
          ? [...group.childIds]
          : Array.isArray(group.blockIds)
          ? [...group.blockIds]
          : [],
        // keep an alias copy so UI/readers can use either
        blockIds: Array.isArray(group.blockIds)
          ? [...group.blockIds]
          : Array.isArray(group.childIds)
          ? [...group.childIds]
          : [],
        position: group.position ?? { x: 0, y: 0 },
        size: group.size ?? { width: 0, height: 0 },
        rotation: group.rotation ?? 0,
        meta: group.meta ?? {},
        // optional offsets map: { blockId: {x,y} }
        blockOffsets: group.blockOffsets ? { ...group.blockOffsets } : {},
      };

      this.groups.push(g);

      // ensure blocks point to this group
      (g.childIds || []).forEach((bid) => {
        const b = this.getBlockById(bid);
        if (b) b.groupId = g.id;
      });

      return g;
    },

    updateGroup(groupId, patch = {}) {
      const gi = this.groups.findIndex((g) => g.id === groupId);
      if (gi === -1) return;
      const g = this.groups[gi];

      // helper to set both keys consistently
      const setIds = (ids = []) => {
        const arr = Array.isArray(ids) ? ids.slice() : [];
        g.childIds = arr;
        g.blockIds = arr.slice();
      };

      // If caller passed blockIds (alternate key), normalize into childIds
      if (patch.blockIds && !patch.childIds) {
        // treat patch.blockIds as authoritative if childIds not provided
        patch.childIds = Array.isArray(patch.blockIds)
          ? patch.blockIds.slice()
          : [];
      }

      // handle childIds specially to keep block.groupId consistent
      if (patch.childIds) {
        const oldChildIds = new Set(g.childIds || []);
        const newChildIds = new Set(patch.childIds || []);

        // removed children -> detach groupId
        for (const oldId of oldChildIds) {
          if (!newChildIds.has(oldId)) {
            const b = this.getBlockById(oldId);
            if (b && b.groupId === groupId) delete b.groupId;
          }
        }

        // added children -> attach groupId
        for (const newId of newChildIds) {
          if (!oldChildIds.has(newId)) {
            const b = this.getBlockById(newId);
            if (b) b.groupId = groupId;
          }
        }

        // set both keys
        setIds(patch.childIds || []);
      }

      // apply other fields (include blockOffsets if provided)
      const allowed = ["position", "size", "rotation", "meta", "blockOffsets"];
      for (const k of allowed) {
        if (k in patch) {
          // shallow copy for objects to avoid accidental shared refs
          if (typeof patch[k] === "object" && patch[k] !== null) {
            g[k] = Array.isArray(patch[k]) ? patch[k].slice() : { ...patch[k] };
          } else {
            g[k] = patch[k];
          }
        }
      }
    },

    removeGroup(groupId) {
      const idx = this.groups.findIndex((g) => g.id === groupId);
      if (idx === -1) return;
      const g = this.groups[idx];
      // detach block.groupId
      (g.childIds || []).forEach((bid) => {
        const b = this.getBlockById(bid);
        if (b && b.groupId === groupId) delete b.groupId;
      });
      this.groups.splice(idx, 1);
    },

    getGroupById(id) {
      return this.groups.find((g) => g.id === id) ?? null;
    },

    ensureGroupRemovedForBlock(blockId) {
      // remove block id from any group's childIds
      this.groups.forEach((g) => {
        if (g.childIds?.includes(blockId)) {
          g.childIds = g.childIds.filter((id) => id !== blockId);
        }
      });
    },

    // ========== undo/redo (command stack) ==========
    applyCommand(cmd) {
      // command must implement do(store) and undo(store)
      try {
        cmd.do(this);
        this.undoStack.push(cmd);
        this.redoStack = [];
      } catch (err) {
        console.error("applyCommand failed:", err);
      }
    },

    undo() {
      if (this.undoStack.length === 0) return;
      const cmd = this.undoStack.pop();
      try {
        cmd.undo(this);
        this.redoStack.push(cmd);
      } catch (err) {
        console.error("undo failed:", err);
      }
    },

    redo() {
      if (this.redoStack.length === 0) return;
      const cmd = this.redoStack.pop();
      try {
        cmd.do(this);
        this.undoStack.push(cmd);
      } catch (err) {
        console.error("redo failed:", err);
      }
    },

    get canUndo() {
      return this.undoStack.length > 0;
    },

    get canRedo() {
      return this.redoStack.length > 0;
    },

    // ========== helpers for serialization / snapshots ==========
    toSerializable() {
      return deepClone({
        project: this.project,
        activePageId: this.activePageId,
        groups: this.groups,
        // note: we do not serialize stacks here (commands may not be serializable)
      });
    },
  };

  // make observable: getters, arrays, objects and methods are bound
  // mark blockRefs and the ref helpers / snapshot helper as non-observable so
  // DOM nodes are not tracked by MobX and don't cause reactions.
  makeAutoObservable(
    store,
    {
      blockRefs: false,
      setBlockRef: false,
      getBlockRef: false,
      beginSnapshot: false,
    },
    { autoBind: true }
  );

  return store;
}
