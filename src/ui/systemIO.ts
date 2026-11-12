// Import and Export in the Parameters panel (plan §8 rows 17 and 18): the hidden file picker that
// Import opens, and the download of the applied system as a JSON file.

import { report, setLabel } from "./buttons";
import { DOWNLOAD, UPLOAD } from "./icons";
import type { Store } from "./state";
import {
  appliedSystem,
  fileName,
  parseSystemFile,
  toSystemFile,
  type SystemSpec,
} from "./systemFile";

/** The largest file Import reads, bytes: a system file is well under 1 KB. */
export const MAX_FILE_BYTES = 64 * 1024;

/**
 * Import and Export side by side, with the picker. A file that is too large, or that
 * `parseSystemFile` rejects, is reported with `warn`; one that it reads goes to `importSystem`.
 */
export function createFileActions(
  store: Store,
  importSystem: (system: SystemSpec) => void,
  warn: (text: string) => void,
): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "file-actions";
  const actionButton = (body: string, text: string, title: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ${text.toLowerCase()}`;
    setLabel(button, body, text);
    button.title = title;
    actions.append(button);
    return button;
  };
  const importButton = actionButton(UPLOAD, "Import", "Load a system from a JSON file");
  const exportButton = actionButton(DOWNLOAD, "Export", "Save the applied system as a JSON file");
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".json,application/json";
  picker.hidden = true;
  actions.append(picker);

  importButton.addEventListener("click", () => picker.click());
  const importPicked = async () => {
    const file = picker.files?.[0];
    // Cleared, so that choosing the same file again imports it again.
    picker.value = "";
    if (!file) return;
    // Refused before it is read, so that a large file picked by mistake is not loaded whole.
    if (file.size > MAX_FILE_BYTES) {
      warn(`Not a ThermoBRIDGE system file: it is larger than ${MAX_FILE_BYTES / 1024} KB.`);
      return;
    }
    const parsed = parseSystemFile(await file.text());
    if (parsed.ok) importSystem(parsed.value);
    else warn(`Not a ThermoBRIDGE system file: ${parsed.problem}.`);
  };
  picker.addEventListener("change", () => {
    importPicked().catch(report);
  });

  exportButton.addEventListener("click", () => {
    const system = appliedSystem(store.state);
    const blob = new Blob([toSystemFile(system)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName(system.name);
    document.body.append(link);
    link.click();
    link.remove();
    // Revoked later, since some browsers start the download only after the click returns.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  return actions;
}
