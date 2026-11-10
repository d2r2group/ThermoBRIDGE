// Lato for all text (SIL Open Font License), bundled so the page loads no font from elsewhere.
import "@fontsource/lato/400.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700.css";
import "./style.css";
import { DEFAULT_PRESET, preset } from "./physics/presets";
import { createAbout } from "./ui/about";
import { createCutInput, createMetastableToggle, createReadout } from "./ui/controls";
import { createLeverReadout, createLeverToggle } from "./ui/leverControls";
import { openLink } from "./ui/link";
import { createLogo } from "./ui/logo";
import { createFooter } from "./ui/modelDetails";
import { createPhaseDiagram } from "./ui/diagram/phaseDiagram";
import { createSlicePanel } from "./ui/slicePanel";
import { createShare } from "./ui/share";
import { Store } from "./ui/state";
import { createSystemMenu } from "./ui/systemMenu";
import { createSystemPanel } from "./ui/systemPanel";
import { createThemeToggle } from "./ui/theme";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("ThermoBRIDGE: #app element is missing from index.html");

// From top to bottom (plan §4): the logo (which snaps the cut to the next invariant), the info
// button and the main row (the System menu, Lever, Metastable and Share; under the logo on a
// narrow phone), with the theme button at the far right; then the plots, fitted to the window's
// height, with a column beside them where it has 19rem, or below them otherwise: the cut input,
// the lever readout (while the lever rule is on), the readout (for screen readers only) and the
// Parameters panel. The footer follows, after <main>.
const header = document.createElement("header");
const mainRow = document.createElement("div");
mainRow.className = "main-row";
mainRow.setAttribute("role", "group");
mainRow.setAttribute("aria-label", "Main controls");
const layout = document.createElement("div");
layout.className = "layout";
// The diagram and the slice panel are stacked with no gap, so the guide lines run straight on.
const plots = document.createElement("div");
plots.className = "plots";
const diagram = document.createElement("div");
const slice = document.createElement("div");
plots.append(diagram, slice);
const controls = document.createElement("aside");
controls.className = "controls";
controls.setAttribute("aria-label", "Cut and system");
layout.append(plots, controls);
app.replaceChildren(header, layout);

const store = new Store(preset(DEFAULT_PRESET));
createLogo(header, store);
// Inside #app, so that the copies in the About overlay compact with the page's controls.
createAbout(header, app);
header.append(mainRow);
createThemeToggle(header);
createCutInput(controls, store);
createLeverReadout(controls, store);
createReadout(controls, store);
const panel = createSystemPanel(controls, store);
// Custom opens the panel, and scrolls to it where the column has wrapped under the plots.
createSystemMenu(mainRow, store, () =>
  panel.open(controls.getBoundingClientRect().top >= plots.getBoundingClientRect().bottom),
);
createLeverToggle(mainRow, store);
createMetastableToggle(mainRow, store);
createShare(mainRow, store);
createPhaseDiagram(diagram, store);
createSlicePanel(slice, store);
createFooter(document.body);

// A share link (plan §8 row 19), at start-up or pasted into an open tab: the fragment is imported,
// then removed, so that a reload does not undo the edits made since.
const openFragment = () => {
  if (location.hash.length <= 1) return;
  const fragment = location.hash;
  history.replaceState(null, "", location.pathname + location.search);
  openLink(fragment, panel, store);
};
openFragment();
window.addEventListener("hashchange", openFragment);
