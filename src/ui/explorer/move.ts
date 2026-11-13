import { dirName, isUnder, pathKey } from "../../files";

export const INTERNAL_MOVE_TYPE = "application/x-ponpoko-editor-path";

export interface MoveRow {
  path: string;
  isDir: boolean;
}

export function moveTargetFolder(
  dragPath: string,
  hovered: MoveRow | null,
  root: string | null,
): string | null {
  if (root === null || dragPath.length === 0) return null;
  if (pathKey(dragPath) === pathKey(root)) return null;
  const folder = hovered === null ? root : hovered.isDir ? hovered.path : dirName(hovered.path);
  if (folder.length === 0) return null;
  if (isUnder(folder, dragPath)) return null;
  if (pathKey(folder) === pathKey(dirName(dragPath))) return null;
  return folder;
}
