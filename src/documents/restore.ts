import { baseName } from "../files";
import type { DocumentsDeps, Documents, RestorableTab } from "./types";

export async function restoreDocuments(deps: DocumentsDeps, openPath: Documents["openPath"], entries: readonly RestorableTab[], activePath: string | null): Promise<void> {
  const { tabs } = deps;
  const failed: string[] = [];
  for (const entry of entries) {
    const tab = await openPath(entry.path, {
      activate: false,
      quiet: true,
      language: entry.language,
      view: {
        topLine: entry.topLine,
        cursorLine: entry.cursorLine,
        cursorColumn: entry.cursorColumn,
      },
    });
    if (tab === null) failed.push(baseName(entry.path));
  }
  if (activePath !== null) {
    const active = tabs.findPath(activePath);
    if (active) tabs.activate(active.id);
  } else if (tabs.activeId() === null) {
    const first = tabs.list()[0];
    if (first) tabs.activate(first.id);
  }
  if (failed.length > 0) {
    deps.onError(
      `Could not reopen ${failed.length === 1 ? "a file" : `${failed.length} files`} from the last session: ${failed.join(", ")}. It may have been moved or deleted.`,
    );
  }
  deps.onChange();
}

