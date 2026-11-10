// Every number as the page writes it: compositions (the bold values, the readout and the lever
// rule), temperatures, percentages, signed α values and Δh. No DOM here.

const SUPERSCRIPT: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** Smallest solubility the grid resolves (plan §2.2); below it the value is "< 10⁻⁹". */
const X_FLOOR = 1e-9;

/** x > 0 as "3.2·10⁻⁵", two significant figures. */
export function scientific(x: number): string {
  const [mantissa, exponent] = x.toExponential(1).split("e") as [string, string];
  const sup = String(Number(exponent))
    .split("")
    .map((ch) => SUPERSCRIPT[ch])
    .join("");
  return `${mantissa}·10${sup}`;
}

/**
 * A composition X_B for the bold values: three decimals, and within 0.001 of a pure end as a
 * power of ten ("4.1·10⁻⁵", "1 − 4.1·10⁻⁵"), down to the grid's reach of 10⁻⁹ (plan §2.2).
 */
export function formatX(X: number): string {
  const y = 1 - X;
  if (X < X_FLOOR) return "< 10⁻⁹";
  if (y < X_FLOOR) return "> 1 − 10⁻⁹";
  if (X < 1e-3) return scientific(X);
  if (y < 1e-3) return `1 − ${scientific(y)}`;
  return X.toFixed(3);
}

/** A composition in the readout and the lever rule: `formatX`, and the pure ends as 0 and 1. */
export function formatComposition(X: number): string {
  if (X === 0) return "0";
  if (X === 1) return "1";
  return formatX(X);
}

/** T* for display: one decimal, as the number field shows it, with its unit. */
export function formatTemperature(T: number): string {
  return `${T.toFixed(1)} K`;
}

/** An invariant temperature as the logo's snap names it: whole kelvins, "634 K". */
export function formatInvariantT(T: number): string {
  return `${Math.round(T)} K`;
}

/** A percentage with a no-break space before the sign: "37 %". */
export function pct(p: number): string {
  return `${p}\u00a0%`;
}

/** A value with its sign: "0", "+15", "−17.5". */
export function signed(x: number): string {
  if (x === 0) return "0";
  return `${x > 0 ? "+" : "−"}${Math.abs(x)}`;
}

/** Δh = T_m Δs in kJ/mol (Δs in J/(mol·K)), for display beside Δs; "—" when not a number. */
export function formatEnthalpy(Tm: number, ds: number): string {
  const dh = (Tm * ds) / 1000;
  return Number.isFinite(dh) ? `${Number(dh.toPrecision(4))} kJ/mol` : "—";
}
