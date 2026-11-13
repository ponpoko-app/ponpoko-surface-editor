import type { CreateAnswer, DeleteAnswer, ListAnswer, ListEntry, RenameAnswer, StatAnswer } from "../../api";
import type { PasteAnswer } from "../../bridge";
import type { TransferItem } from "../../transfer";

export interface ExplorerFs {
  list(path: string, options?: { showHidden?: boolean }): Promise<ListAnswer>;
  create(path: string, kind: "file" | "directory"): Promise<CreateAnswer>;
  copy(from: string, to: string): Promise<{ from: string; to: string; is_dir: boolean; bytes: number; files: number }>;
  writeAsset(path: string, base64: string): Promise<{ path: string; bytes: number }>;
  rename(path: string, to: string): Promise<RenameAnswer>;
  remove(path: string, options?: { recursive?: boolean }): Promise<DeleteAnswer>;
  stat(path: string): Promise<StatAnswer>;
  reveal(path: string): Promise<{ revealed: boolean }>;
}

export interface ExplorerRow {
  path: string;
  name: string;
  isDir: boolean;
  isSymlink: boolean;
  depth: number;
}

export interface ExplorerTreeInput {
  root: string;
  expanded: ReadonlySet<string>;
  children: ReadonlyMap<string, readonly ListEntry[]>;
  showHidden: boolean;
  filter: string;
}


export interface NameRequest {
  title: string;
  message?: string;
  label: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  validate?(value: string): string | null;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

export interface ExplorerDeps {
  fs: ExplorerFs;
  paste(): Promise<PasteAnswer>;
  onDrop(handler: (paths: readonly string[]) => void): () => void;
  root(): string | null;
  activePath(): string | null;
  openFile(path: string): void | Promise<void>;
  openFolder?(): void | Promise<void>;
  askName(request: NameRequest): Promise<string | null>;
  confirm(request: ConfirmRequest): Promise<boolean>;
  onRenamed(from: string, to: string): void;
  onDeleted(path: string): void;
  onReveal(path: string): void | Promise<void>;
  onCopyPath(path: string): void | Promise<void>;
  onError(message: string): void;
  onNote(message: string): void;
}

export interface Explorer {
  readonly element: HTMLElement;
  setRoot(root: string | null): void;
  refresh(): Promise<void>;
  setActivePath(path: string | null): void;
  revealActive(): Promise<void>;
  create(kind: "file" | "directory"): Promise<void>;
  transfer(items: readonly TransferItem[]): Promise<void>;
  pasteFromClipboard(): Promise<void>;
  renameSelected(): Promise<void>;
  deleteSelected(): Promise<void>;
  collapseAll(): void;
  focus(): void;
  selectedPath(): string | null;
  destroy(): void;
}

