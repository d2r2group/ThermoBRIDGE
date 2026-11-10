// Copied from pTerrain's ui/repoLink.ts, with ThermoBRIDGE's URL (plan §4.3).
//
// The footer's GitHub link: a link to the source.

import { GITHUB, icon } from "./icons";

/** Where the source lives. */
export const REPO_URL = "https://github.com/d2r2group/MATL7355_Apps/tree/main/ThermoBRIDGE";

/** A link to the repository with the GitHub mark, opening in a new tab. */
export function createRepoLink(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "repo-link";
  link.href = REPO_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = "Source on GitHub";
  link.innerHTML = `${icon(GITHUB, 14)}GitHub`;
  return link;
}
