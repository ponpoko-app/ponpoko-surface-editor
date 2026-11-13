import type { Tab } from "../tabs";
import type { EditorSettings } from "../session";
import { detectIndentation } from "./text";

export function nextUntitledName(tabs: readonly Tab[]): string {
  const used = new Set(tabs.map((tab) => tab.name));
  for (let index = 1; index < 10_000; index += 1) {
    const name = `Untitled-${index}`;
    if (!used.has(name)) return name;
  }
  return `Untitled-${Date.now()}`;
}

export interface ResolvedIndentation {
  tabSize: number;
  insertSpaces: boolean;
  detected: boolean;
  settings: EditorSettings;
}

export function resolveIndentation(text: string, settings: EditorSettings): ResolvedIndentation {
  const guess = detectIndentation(text);
  const tabSize = guess?.tabSize ?? settings.tabSize;
  const insertSpaces = guess?.insertSpaces ?? settings.insertSpaces;
  return {
    tabSize,
    insertSpaces,
    detected: guess !== null,
    settings: { ...settings, tabSize, insertSpaces },
  };
}

