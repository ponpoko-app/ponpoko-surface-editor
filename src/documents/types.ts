import type { EditorState } from "@codemirror/state";
import type { EditorApi } from "../api";
import type { FilePickRequest } from "../bridge";
import type { LanguageId } from "../languages";
import type { EditorSettings } from "../session";
import type { Eol, Tab, TabModel, TabView } from "../tabs";

export type UnsavedChoice = "save" | "discard" | "cancel";

export type ConflictChoice = "overwrite" | "reload" | "keep" | "cancel";

export type ConflictKind = "save" | "reload";

export type ReconcileOutcome = "unchanged" | "reloaded" | "kept" | "missing" | "skipped";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface DocumentsDeps {
  api: Pick<EditorApi, "read" | "write" | "stat">;
  tabs: TabModel;
  createState(
    text: string,
    language: LanguageId,
    settings: EditorSettings,
    view?: Partial<TabView>,
    options?: { largeFile?: boolean },
  ): EditorState;
  capture(): TabView;
  settings(): EditorSettings;
  pickFile(request: FilePickRequest): Promise<string | null>;
  askUnsaved(name: string): Promise<UnsavedChoice>;
  askConflict?(kind: ConflictKind, name: string): Promise<ConflictChoice>;
  confirm(options: ConfirmOptions): Promise<boolean>;
  reconfigureLanguage(language: LanguageId): void;
  preferredDirectory(): string | null;
  onChange(): void;
  onError(message: string): void;
  onNote(message: string): void;
  onSaved?(path: string): void;
}

export interface Documents {
  openPath(path: string, options?: OpenPathOptions): Promise<Tab | null>;
  openViaDialog(): Promise<void>;
  newUntitled(): Tab;
  save(tabId: string): Promise<boolean>;
  saveActive(): Promise<boolean>;
  saveAs(tabId: string): Promise<boolean>;
  saveAsActive(): Promise<boolean>;
  saveAll(): Promise<number>;
  revert(tabId: string): Promise<boolean>;
  close(tabId: string): Promise<boolean>;
  closeActive(): Promise<boolean>;
  closeOthers(tabId: string): Promise<boolean>;
  closeAll(): Promise<boolean>;
  reopenClosed(): void;
  activate(tabId: string): void;
  next(): void;
  previous(): void;
  activateIndex(index: number): void;
  setLanguage(tabId: string, language: LanguageId): void;
  setEol(tabId: string, eol: Eol): void;
  setIndentation(tabId: string, tabSize: number, insertSpaces: boolean): void;
  restore(entries: readonly RestorableTab[], activePath: string | null): Promise<void>;
  rememberActive(): void;
  applyRenamed(from: string, to: string): number;
  applyDeleted(path: string): { closed: number; kept: readonly string[] };
  applyExternalWrite(paths: readonly string[]): Promise<{ reloaded: readonly string[]; kept: readonly string[] }>;
  reconcile(tabId: string): Promise<ReconcileOutcome>;
}

export interface OpenPathOptions {
  activate?: boolean;
  view?: Partial<TabView>;
  language?: LanguageId | null;
  quiet?: boolean;
}

export interface RestorableTab {
  path: string;
  language: LanguageId | null;
  eol: Eol;
  topLine: number;
  cursorLine: number;
  cursorColumn: number;
}

