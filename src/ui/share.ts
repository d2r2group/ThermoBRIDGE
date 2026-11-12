// Share at the main row's end (plan §8 row 19), as in pTerrain's bar above the plots, so it is in
// reach with the Parameters panel closed: a link to the applied system and the view, through the
// share sheet on a phone and the clipboard elsewhere, or shown under the button when it can be
// neither shared nor copied.

import { report, setLabel } from "./buttons";
import { CHECK, SHARE } from "./icons";
import type { Store } from "./state";
import { appliedSystem, toLink } from "./systemFile";

/** How long Share reads *Copied*, and the status says so, after copying the link. */
const COPIED_MS = 2000;

/** What the status announces once the link is copied. */
export const COPIED_STATUS = "Link copied";

/** Appends Share to `bar`, with its status for screen readers and its fallback link. */
export function createShare(bar: HTMLElement, store: Store): void {
  const box = document.createElement("div");
  box.className = "share-box";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "share btn";
  setLabel(button, SHARE, "Share");
  button.title =
    "Share a link to the applied system and this view, or to the α mode at this system";
  // A label that changes is not announced, so a live status says that the link was copied.
  const status = document.createElement("span");
  status.className = "visually-hidden";
  status.setAttribute("role", "status");
  const fallback = document.createElement("div");
  fallback.className = "share-fallback";
  fallback.hidden = true;
  box.append(button, status, fallback);
  bar.append(box);

  const hideLink = () => {
    fallback.hidden = true;
    fallback.replaceChildren();
  };
  // It closes once focus moves or a pointer presses outside Share and the link, or on Escape,
  // which hands focus back to Share. A click on its text moves focus to no element, so focus
  // leaving the link alone does not close it.
  const outside = (event: Event) => {
    if (!fallback.hidden && !box.contains(event.target as Node)) hideLink();
  };
  document.addEventListener("focusin", outside);
  document.addEventListener("pointerdown", outside);
  fallback.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    hideLink();
    button.focus();
  });

  /** Shows the link in a read-only, selected field under Share. */
  const showLink = (url: string) => {
    const line = document.createElement("p");
    line.textContent = "Copy this link:";
    const field = document.createElement("input");
    field.type = "text";
    field.readOnly = true;
    field.value = url;
    field.className = "share-link field-input";
    field.setAttribute("aria-label", "Share link");
    fallback.replaceChildren(line, field);
    fallback.hidden = false;
    field.focus();
    field.select();
  };

  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      showLink(url);
      return;
    }
    setLabel(button, CHECK, "Copied");
    status.textContent = COPIED_STATUS;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      setLabel(button, SHARE, "Share");
      status.textContent = "";
    }, COPIED_MS);
  };

  // On a phone (a coarse pointer) the share sheet; elsewhere, or without it, the clipboard.
  const share = async () => {
    hideLink();
    const system = appliedSystem(store.state);
    const { mode, cut, showLever, X0, alphaLock } = store.state;
    const tail =
      mode === "alpha" ? { alpha: { locked: alphaLock } } : showLever ? { cut, X0 } : { cut };
    const url = location.href.replace(/#.*$/, "") + toLink(system, tail);
    const phone = matchMedia("(pointer: coarse)").matches;
    if (phone && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: system.name, url });
        return;
      } catch (err) {
        // Closing the share sheet is not a failure.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await copy(url);
  };
  button.addEventListener("click", () => {
    share().catch(report);
  });
}
