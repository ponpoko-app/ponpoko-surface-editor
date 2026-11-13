import type { LanguageId } from "../languages";
import { languageLabel } from "../languages";
import type { Eol } from "../tabs";
import type { DocumentsDeps } from "./types";

export function createDocumentOptions(deps: DocumentsDeps) {
  const { tabs } = deps;
  function setLanguage(tabId: string, language: LanguageId): void {
    const tab = tabs.list().find((candidate) => candidate.id === tabId);
    if (!tab || tab.language === language) return;
    tabs.setLanguage(tabId, language, true);
    if (tabs.activeId() === tabId) deps.reconfigureLanguage(language);
    deps.onNote(`${tab.name}: language is now ${languageLabel(language)}`);
    deps.onChange();
  }

  function setEol(tabId: string, eol: Eol): void {
    const tab = tabs.list().find((candidate) => candidate.id === tabId);
    if (!tab) return;
    tabs.setEol(tabId, eol);
    deps.onNote(`${tab.name} will be saved with ${eol === "crlf" ? "CRLF" : "LF"} line endings`);
    deps.onChange();
  }

  function setIndentation(tabId: string, tabSize: number, insertSpaces: boolean): void {
    const tab = tabs.list().find((candidate) => candidate.id === tabId);
    if (!tab) return;
    tabs.setIndentation(tabId, tabSize, insertSpaces, false, true);
    deps.onNote(
      `${tab.name}: indenting with ${insertSpaces ? `${tabSize} spaces` : "tabs"} for this file`,
    );
    deps.onChange();
  }

  return { setLanguage, setEol, setIndentation };
}
