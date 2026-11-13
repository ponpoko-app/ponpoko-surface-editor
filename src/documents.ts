import { createDocumentOptions } from "./documents/options";
import { restoreDocuments } from "./documents/restore";

import { LARGE_FILE_BYTES, baseName, formatBytes, isAssetPath, isLargeFile, joinPath, pathKey } from "./files";
import { languageFor } from "./languages";
import { detectEol, messageOf, normalizeEol, toDiskText } from "./documents/text";

export { detectEol, detectIndentation, normalizeEol, toDiskText } from "./documents/text";
import { createDiskWatcher } from "./documents/watch";
import { createExternalOps } from "./documents/external";
import type { Tab } from "./tabs";

export type * from "./documents/types";
import type { DocumentsDeps, Documents, UnsavedChoice, ConflictKind, ConflictChoice, OpenPathOptions } from "./documents/types";
import { nextUntitledName, resolveIndentation } from "./documents/settings";
export { nextUntitledName, resolveIndentation } from "./documents/settings";
export type { ResolvedIndentation } from "./documents/settings";

export function createDocuments(deps: DocumentsDeps): Documents {
  const { tabs } = deps;
  let busy = false;
  const writing = new Set<string>();
  const acknowledged = new Map<string, number>();
  const checking = new Set<string>();

  const askConflict = (kind: ConflictKind, name: string): Promise<ConflictChoice> =>
    deps.askConflict === undefined ? Promise.resolve("cancel") : deps.askConflict(kind, name);

  const rememberActive = (): void => {
    const active = tabs.active();
    if (active && !active.asset) tabs.remember(active.id, deps.capture());
  };

  const watcher = createDiskWatcher(deps, { acknowledged, checking, writing }, askConflict);
  const reconcile = watcher.reconcile;

  async function openPath(path: string, options: OpenPathOptions = {}): Promise<Tab | null> {
    const existing = tabs.findPath(path);
    if (existing) {
      if (options.activate !== false) {
        rememberActive();
        tabs.activate(existing.id);
        deps.onChange();
        void reconcile(existing.id);
      }
      return existing;
    }

    if (isAssetPath(path)) return openAsset(path, options);

    try {
      const [read, info] = await Promise.all([deps.api.read(path), deps.api.stat(path)]);
      const eol = detectEol(read.content);
      const text = normalizeEol(read.content);
      const language = options.language ?? languageFor(path);
      const bytes = read.bytes;
      const largeFile = isLargeFile(bytes);
      const indent = resolveIndentation(text, deps.settings());
      const state = deps.createState(text, language, indent.settings, options.view, { largeFile });
      const { tab } = tabs.open({
        path,
        state,
        savedText: text,
        language,
        languageOverridden: options.language !== undefined && options.language !== null,
        eol,
        tabSize: indent.tabSize,
        insertSpaces: indent.insertSpaces,
        indentationDetected: indent.detected,
        indentationPinned: false,
        modifiedMs: info.exists ? info.modified_ms ?? null : read.modified_ms ?? null,
        bytes,
        view: options.view,
        activate: options.activate,
      });
      if (largeFile && options.quiet !== true) {
        deps.onNote(
          `${baseName(path)} is ${formatBytes(bytes)}; syntax highlighting is off above ${formatBytes(LARGE_FILE_BYTES)} so that typing stays responsive.`,
        );
      }
      deps.onChange();
      return tab;
    } catch (error) {
      if (options.quiet !== true) deps.onError(`Could not open ${baseName(path)}: ${messageOf(error)}`);
      return null;
    }
  }

  async function openAsset(path: string, options: OpenPathOptions): Promise<Tab | null> {
    try {
      const info = await deps.api.stat(path);
      if (!info.exists || info.is_file === false) {
        if (options.quiet !== true) {
          deps.onError(`Could not open ${baseName(path)}: there is no file at ${path}`);
        }
        return null;
      }
      const settings = deps.settings();
      const state = deps.createState("", "text", settings, options.view);
      const { tab } = tabs.open({
        path,
        state,
        savedText: "",
        language: "text",
        languageOverridden: false,
        eol: "lf",
        tabSize: settings.tabSize,
        insertSpaces: settings.insertSpaces,
        indentationDetected: false,
        indentationPinned: false,
        modifiedMs: info.modified_ms ?? null,
        bytes: info.bytes,
        view: options.view,
        activate: options.activate,
        asset: true,
      });
      if (options.quiet !== true) {
        deps.onNote(`${baseName(path)} is an image; it is shown read-only in the preview`);
      }
      deps.onChange();
      return tab;
    } catch (error) {
      if (options.quiet !== true) deps.onError(`Could not open ${baseName(path)}: ${messageOf(error)}`);
      return null;
    }
  }

  async function openViaDialog(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const directory = deps.preferredDirectory();
      const chosen = await deps.pickFile({
        mode: "open",
        title: "Open a file in the Editor",
        ...(directory === null ? {} : { defaultPath: directory }),
      });
      if (chosen === null) {
        deps.onNote("nothing was opened");
        return;
      }
      await openPath(chosen);
      deps.onNote(`opened ${baseName(chosen)}`);
    } catch (error) {
      deps.onError(`Could not open a file: ${messageOf(error)}`);
    } finally {
      busy = false;
    }
  }

  function newUntitled(): Tab {
    const name = nextUntitledName(tabs.list());
    const settings = deps.settings();
    const state = deps.createState("", "text", settings);
    const { tab } = tabs.open({
      path: "",
      name,
      state,
      savedText: "",
      language: "text",
      eol: "lf",
      tabSize: settings.tabSize,
      insertSpaces: settings.insertSpaces,
      indentationDetected: false,
      indentationPinned: false,
      modifiedMs: null,
      bytes: 0,
      activate: true,
    });
    deps.onChange();
    deps.onNote(`${name}: a new file; Save or Save As writes it to disk`);
    return tab;
  }

  async function writeTab(tab: Tab, target: string): Promise<boolean> {
    if (tab.asset) {
      deps.onError(
        `${tab.name} is an image preview; this editor shows images but does not write them.`,
      );
      return false;
    }
    if (writing.has(tab.id)) return false;
    writing.add(tab.id);
    try {
      const samePath = pathKey(target) === pathKey(tab.path);
      const other = samePath ? null : tabs.findPath(target);
      if (other !== null && other.id !== tab.id && tabs.dirty(other)) {
        deps.onError(
          `${baseName(target)} is already open in another tab with unsaved changes. Save or close that tab first.`,
        );
        return false;
      }
      if (samePath) {
        const disk = await watcher.diskMovedOn(tab);
        if (disk.changed && disk.exists) {
          const choice = await askConflict("save", tab.name);
          if (choice === "cancel") {
            deps.onNote(
              `${tab.name} was not saved: it changed on disk and the overwrite was cancelled. Reload it to see what is there now.`,
            );
            return false;
          }
          if (choice === "reload") {
            const reloaded = await watcher.reloadFromDisk(tab);
            deps.onNote(
              reloaded
                ? `${tab.name} was reloaded from disk; nothing was saved over it`
                : `${tab.name} could not be reloaded, so nothing was saved over it`,
            );
            return false;
          }
        }
      }
      const diskText = toDiskText(tab.state.doc.toString(), tab.eol);
      const answer = await deps.api.write(target, diskText);
      const info = await deps.api.stat(target).catch(() => null);
      if (target !== tab.path) {
        tabs.renamePath(tab.id, target);
        if (other !== null && other.id !== tab.id) tabs.drop(other.id);
      }
      tabs.markSaved(tab.id, {
        bytes: answer.bytes,
        modifiedMs: info !== null && info.exists ? info.modified_ms ?? null : null,
      });
      acknowledged.delete(tab.id);
      deps.onNote(`saved ${baseName(target)}`);
      deps.onSaved?.(target);
      deps.onChange();
      return true;
    } catch (error) {
      deps.onError(`Could not save ${baseName(target)}: ${messageOf(error)}`);
      return false;
    } finally {
      writing.delete(tab.id);
    }
  }

  async function save(tabId: string): Promise<boolean> {
    const tab = tabs.list().find((candidate) => candidate.id === tabId);
    if (!tab) return false;
    if (tab.path.length === 0) return saveAs(tabId);
    return writeTab(tab, tab.path);
  }

  async function saveAs(tabId: string): Promise<boolean> {
    const tab = tabs.list().find((candidate) => candidate.id === tabId);
    if (!tab) return false;
    if (tab.asset) {
      deps.onError(
        `${tab.name} is an image preview; this editor shows images but does not write them.`,
      );
      return false;
    }
    if (busy) return false;
    busy = true;
    try {
      const directory = deps.preferredDirectory();
      const seed =
        tab.path.length > 0
          ? tab.path
          : directory === null
            ? undefined
            : joinPath(directory, tab.name);
      const target = await deps.pickFile({
        mode: "save",
        title: `Save ${tab.name} as…`,
        ...(seed === undefined ? {} : { defaultPath: seed }),
      });
      if (target === null) {
        deps.onNote("nothing was saved");
        return false;
      }
      return await writeTab(tab, target);
    } catch (error) {
      deps.onError(`Could not save ${tab.name}: ${messageOf(error)}`);
      return false;
    } finally {
      busy = false;
    }
  }

  async function saveAll(): Promise<number> {
    let saved = 0;
    for (const tab of tabs.list()) {
      if (!tabs.dirty(tab)) continue;
      if (!(await save(tab.id))) break;
      saved += 1;
    }
    if (saved === 0) deps.onNote("there was nothing to save");
    return saved;
  }

  async function revert(tabId: string): Promise<boolean> {
    const tab = tabs.list().find((candidate) => candidate.id === tabId);
    if (!tab) return false;
    if (tab.path.length === 0) {
      deps.onNote(`${tab.name} has not been saved yet, so there is nothing on disk to go back to`);
      return false;
    }
    if (tab.asset) {
      deps.onNote(`${tab.name} is an image; the preview reads it again when it changes on disk`);
      return false;
    }
    if (tabs.dirty(tab)) {
      const confirmed = await deps.confirm({
        title: `Revert ${tab.name}?`,
        message: `The unsaved edits in ${tab.name} will be discarded and the tab will read the file from disk again. This cannot be undone from this editor.`,
        confirmLabel: "Revert",
        danger: true,
      });
      if (!confirmed) {
        deps.onNote("nothing was reverted");
        return false;
      }
    }
    const reloaded = await watcher.reloadFromDisk(tab);
    if (reloaded) deps.onNote(`${tab.name} was reloaded from disk`);
    return reloaded;
  }

  async function close(tabId: string): Promise<boolean> {
    const tab = tabs.list().find((candidate) => candidate.id === tabId);
    if (!tab) return false;
    if (busy) return false;
    if (tabs.activeId() === tabId) rememberActive();
    if (tabs.dirty(tab)) {
      busy = true;
      let choice: UnsavedChoice;
      try {
        choice = await deps.askUnsaved(tab.name);
      } finally {
        busy = false;
      }
      if (choice === "cancel") return false;
      if (choice === "save" && !(await save(tab.id))) return false;
    }
    tabs.close(tab.id);
    deps.onChange();
    return true;
  }

  async function closeOthers(tabId: string): Promise<boolean> {
    for (const tab of [...tabs.list()]) {
      if (tab.id === tabId) continue;
      if (!(await close(tab.id))) return false;
    }
    return true;
  }

  async function closeAll(): Promise<boolean> {
    for (const tab of [...tabs.list()]) {
      if (!(await close(tab.id))) return false;
    }
    return true;
  }

  function reopenClosed(): void {
    const closed = tabs.takeClosed();
    if (closed === null) {
      deps.onNote("there is no closed tab to bring back");
      return;
    }
    const current = deps.settings();
    const ownIndentation = closed.indentationDetected || closed.indentationPinned;
    const tabSize = ownIndentation ? closed.tabSize : current.tabSize;
    const insertSpaces = ownIndentation ? closed.insertSpaces : current.insertSpaces;
    const settings = { ...current, tabSize, insertSpaces };
    const state = deps.createState(
      closed.savedText,
      closed.language,
      settings,
      {
        scrollTop: 0,
        topLine: 1,
        cursorLine: 1,
        cursorColumn: 1,
      },
      { largeFile: isLargeFile(closed.bytes) },
    );
    const { tab } = tabs.open({
      path: closed.path,
      name: closed.name,
      state,
      savedText: closed.savedText,
      language: closed.language,
      languageOverridden: closed.languageOverridden,
      eol: closed.eol,
      tabSize,
      insertSpaces,
      indentationDetected: closed.indentationDetected,
      indentationPinned: closed.indentationPinned,
      modifiedMs: closed.modifiedMs,
      bytes: closed.bytes,
      view: { scrollTop: 0, topLine: 1, cursorLine: 1, cursorColumn: 1 },
      activate: true,
      asset: closed.asset,
    });
    deps.onChange();
    void reconcile(tab.id);
  }

  function activate(tabId: string): void {
    const tab = tabs.list().find((candidate) => candidate.id === tabId);
    if (!tab) return;
    rememberActive();
    tabs.activate(tabId);
    deps.onChange();
    void reconcile(tabId);
  }

  function next(): void {
    rememberActive();
    tabs.next();
    deps.onChange();
    const active = tabs.active();
    if (active !== null) void reconcile(active.id);
  }

  function previous(): void {
    rememberActive();
    tabs.previous();
    deps.onChange();
    const active = tabs.active();
    if (active !== null) void reconcile(active.id);
  }

  function activateIndex(index: number): void {
    rememberActive();
    tabs.activateIndex(index);
    deps.onChange();
    const active = tabs.active();
    if (active !== null) void reconcile(active.id);
  }

  const { setLanguage, setEol, setIndentation } = createDocumentOptions(deps);

  const external = createExternalOps(deps, tabs);
  const applyRenamed = external.applyRenamed;
  const applyDeleted = external.applyDeleted;
  const applyExternalWrite = external.applyExternalWrite;


  return {
    openPath,
    openViaDialog,
    newUntitled,
    save,
    saveActive: () => {
      const active = tabs.active();
      return active ? save(active.id) : Promise.resolve(false);
    },
    saveAs,
    saveAsActive: () => {
      const active = tabs.active();
      return active ? saveAs(active.id) : Promise.resolve(false);
    },
    saveAll,
    revert,
    close,
    closeActive: () => {
      const active = tabs.active();
      return active ? close(active.id) : Promise.resolve(false);
    },
    closeOthers,
    closeAll,
    reopenClosed,
    activate,
    next,
    previous,
    activateIndex,
    setLanguage,
    setEol,
    setIndentation,
    restore: (entries, activePath) => restoreDocuments(deps, openPath, entries, activePath),
    rememberActive,
    applyRenamed,
    applyDeleted,
    applyExternalWrite,
    reconcile,
  };
}
