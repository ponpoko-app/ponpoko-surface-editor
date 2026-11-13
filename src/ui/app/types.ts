import type { SurfaceLink } from "../../bridge";
import type { Platform } from "../../keymap";
import type { StorageLike } from "../../session";
import type { createTabModel } from "../../tabs";

export interface EditorAppOptions {
  root: HTMLElement;
  link: SurfaceLink;
  storage?: StorageLike | null;
  platform?: Platform;
}

export interface EditorApp {
  destroy(): void;
  tabs(): ReturnType<typeof createTabModel>;
  render(): void;
}

