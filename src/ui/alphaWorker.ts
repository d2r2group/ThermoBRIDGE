// The Web Worker of fullDiagrams.ts (plan §9 phase 15): the full diagram of each α-mode position
// it is sent, posted back as plain data. A position that cannot be computed is posted as null.

import { computeAlpha } from "./alphaCache";
import type { AlphaPoint } from "./alphaPoint";
import { toPosted, type Reply } from "./fullDiagrams";

self.onmessage = ({ data: point }: MessageEvent<AlphaPoint>) => {
  const diagram = computeAlpha(point, false);
  const reply: Reply = { point, diagram: diagram && toPosted(diagram) };
  self.postMessage(reply);
};
