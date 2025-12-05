import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid"; // install uuid if you want id re-generation

const deepClone = (v) =>
  typeof structuredClone === "function"
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));

export default function useInfograhicsData({
  initialData = null,
  fetchUrl = null,
  regenerateIds = false,
} = {}) {
  // Project state holds the whole document (pages array, activePageId optional)
  const [project, setProject] = useState(() =>
    initialData ? deepClone(initialData) : null
  );
  const [activePageId, setActivePageId] = useState(() =>
    initialData ? initialData.activePageId ?? initialData.pages?.[0]?.id : null
  );
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const loadedRef = useRef(false);

  // DOM refs per page: { [pageId]: { [blockId]: HTMLElement } }
  const blockRefs = useRef({});

  const HISTORY_LIMIT = 30;

  const snapshot = useCallback(() => {
    setHistoryPast((prev) => {
      const next = [...prev, deepClone(project)];
      if (next.length > HISTORY_LIMIT) next.shift();
      return next;
    });
    // starting a new change invalidates redo stack
    setHistoryFuture([]);
  }, [project]);

  const canUndo = historyPast.length > 0;
  const canRedo = historyFuture.length > 0;

  const undo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const prevState = past[past.length - 1];
      // push current present into future
      setHistoryFuture((future) => [deepClone(project), ...future]);
      // set project to prev state
      setProject(deepClone(prevState));
      // drop last from past
      return past.slice(0, -1);
    });
  }, [project, setProject]);

  const redo = useCallback(() => {
    setHistoryFuture((future) => {
      if (future.length === 0) return future;
      const nextState = future[0];
      // push current present to past
      setHistoryPast((past) => [...past, deepClone(project)]);
      // set project to redo state
      setProject(deepClone(nextState));
      // remove first from future
      return future.slice(1);
    });
  }, [project, setProject]);

  const clearHistory = useCallback(() => {
    setHistoryPast([]);
    setHistoryFuture([]);
  }, []);

  // Convenience getters
  const getActivePage = useCallback(() => {
    if (!project) return null;
    return project.pages.find((p) => p.id === activePageId) ?? null;
  }, [project, activePageId]);

  const getActiveBlocks = useCallback(
    () => getActivePage()?.blocks ?? [],
    [getActivePage]
  );

  // Mutators
  const updateActivePageBlocks = useCallback(
    (updater) => {
      setProject((prev) => {
        if (!prev) return prev;
        const pages = prev.pages.map((p) => {
          if (p.id !== activePageId) return p;
          const nextBlocks =
            typeof updater === "function" ? updater(p.blocks) : updater;
          return { ...p, blocks: nextBlocks };
        });
        return { ...prev, pages };
      });
    },
    [activePageId]
  );

  // Block refs helpers
  const setBlockRef = useCallback((pageId, blockId, el) => {
    blockRefs.current[pageId] = blockRefs.current[pageId] || {};
    if (el) blockRefs.current[pageId][blockId] = el;
    else if (blockRefs.current[pageId])
      delete blockRefs.current[pageId][blockId];
  }, []);

  const getBlockRef = useCallback((pageId, blockId) => {
    return blockRefs.current[pageId]?.[blockId] ?? null;
  }, []);

  // Import / replace project data (deep clone). Optionally regenerate ids to avoid collisions on merge.
  const importProject = useCallback((rawProject, { regenIds = false } = {}) => {
    if (!rawProject) return;
    let p = deepClone(rawProject);
    if (regenIds) {
      p.id = uuidv4();
      p.pages = (p.pages || []).map((page) => ({
        ...page,
        id: uuidv4(),
        blocks: (page.blocks || []).map((b) => ({ ...b, id: uuidv4() })),
      }));
    }
    setProject(p);
    setActivePageId(p.activePageId ?? p.pages?.[0]?.id ?? null);
  }, []);

  // Switch page safely: we will call an optional callback (like endInteraction) so the host can clean up
  const switchToPage = useCallback(
    (newPageId, { onBeforeSwitch = null } = {}) => {
      if (onBeforeSwitch) {
        try {
          onBeforeSwitch();
        } catch (e) {
          console.warn("onBeforeSwitch callback threw:", e);
        }
      }
      setActivePageId(newPageId);
      // selection clearing / re-measure should be handled by host (UI) after page mounts
    },
    []
  );

  useEffect(() => {
    console.log("👀 PROJECT UPDATED:", project);
  }, [project]);

  // If fetchUrl given, fetch once on mount (or when fetchUrl changes) and import
  useEffect(() => {
    if (!fetchUrl) return;
    let cancelled = false;
    async function fetchProject() {
      try {
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        if (cancelled) return;
        importProject(json, { regenIds: regenerateIds });
      } catch (err) {
        console.error("Failed to fetch project:", err);
      }
    }
    fetchProject();
    return () => {
      cancelled = true;
    };
  }, [fetchUrl, importProject, regenerateIds]);

  // If initialData provided after mount, import once (guard loadedRef to avoid re-imports)
  useEffect(() => {
    if (!initialData || loadedRef.current) return;
    importProject(initialData, { regenIds: regenerateIds });
    loadedRef.current = true;
  }, [initialData, importProject, regenerateIds]);

  return {
    project,
    activePageId,
    setActivePageId,
    activePage: getActivePage(),
    activeBlocks: getActiveBlocks(),
    updateActivePageBlocks,
    importProject,
    switchToPage,
    blockRefs,
    setBlockRef,
    getBlockRef,
    // Useful derived helpers:
    getBlockById: useCallback(
      (id) => getActiveBlocks().find((b) => b.id === id),
      [getActiveBlocks]
    ),
    snapshot,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  };
}
