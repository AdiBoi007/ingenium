export type ModelId =
  | "projectile"
  | "incline"
  | "spring"
  | "circuit"
  | "lens"
  | "stoichiometry"
  | "dilution"
  | "kinetics"
  | "quadratic"
  | "intersection"
  | "inheritance"
  | "mitosis";
export type Parameters = Record<string, number | string>;
export type Point = { x: number; y: number };
export type Metric = {
  label: string;
  value: number | string | null;
  unit?: string;
};
export type ModelResult = {
  metrics: Metric[];
  points: Point[];
  working: string[];
  note?: string;
  duration?: number;
  values: Record<string, number | string | number[] | null>;
};
export type ParameterDefinition = {
  key: string;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};
export type LabDefinition = {
  id: ModelId;
  title: string;
  subject: string;
  description: string;
  defaults: Parameters;
  parameters: ParameterDefinition[];
  assumptions: string;
  xLabel: string;
  yLabel: string;
  timeDependent?: boolean;
};
const numeric = (
  key: string,
  label: string,
  unit: string,
  min: number,
  max: number,
  step = 1,
): ParameterDefinition => ({ key, label, unit, min, max, step });
export const labs: LabDefinition[] = [
  {
    id: "projectile",
    title: "Projectile motion",
    subject: "Physics",
    description: "Follow a trajectory. Find the physics.",
    defaults: { speed: 20, angle: 30, height: 0, gravity: 10 },
    parameters: [
      numeric("speed", "Initial speed", "m/s", 0, 100, 0.1),
      numeric("angle", "Launch angle", "°", 0, 90, 0.1),
      numeric("height", "Initial height", "m", 0, 100, 0.1),
      numeric("gravity", "Gravity", "m/s²", 0.1, 30, 0.01),
    ],
    assumptions:
      "Point particle; constant gravity; level ground; no air resistance. Set speed to 0 for free fall. Positive y is upward.",
    xLabel: "Horizontal distance (m)",
    yLabel: "Height (m)",
    timeDependent: true,
  },
  {
    id: "incline",
    title: "Block on an incline",
    subject: "Physics",
    description: "Discover when friction holds—and when it slips.",
    defaults: {
      mass: 2,
      angle: 30,
      staticFriction: 0.4,
      kineticFriction: 0.25,
      gravity: 9.81,
    },
    parameters: [
      numeric("mass", "Block mass", "kg", 0.1, 50, 0.1),
      numeric("angle", "Incline angle", "°", 0, 89, 0.1),
      numeric("staticFriction", "Static friction coefficient", "", 0, 2, 0.01),
      numeric(
        "kineticFriction",
        "Kinetic friction coefficient",
        "",
        0,
        2,
        0.01,
      ),
      numeric("gravity", "Gravity", "m/s²", 0.1, 30, 0.01),
    ],
    assumptions:
      "Rigid block initially at rest on a fixed plane. Coulomb friction, μₖ ≤ μₛ. Motion, if any, is down the plane.",
    xLabel: "Time (s)",
    yLabel: "Distance down incline (m)",
    timeDependent: true,
  },
  {
    id: "spring",
    title: "Spring oscillator",
    subject: "Physics",
    description: "See motion and energy trade places.",
    defaults: { mass: 1, stiffness: 4, amplitude: 1, phase: 0 },
    parameters: [
      numeric("mass", "Mass", "kg", 0.1, 20, 0.1),
      numeric("stiffness", "Spring constant", "N/m", 0.1, 100, 0.1),
      numeric("amplitude", "Amplitude", "m", 0, 5, 0.1),
      numeric("phase", "Initial phase", "°", 0, 360, 1),
    ],
    assumptions:
      "Ideal mass–spring system; no damping; displacement is measured from equilibrium. x(t) = A cos(ωt + φ).",
    xLabel: "Time (s)",
    yLabel: "Displacement (m)",
    timeDependent: true,
  },
  {
    id: "circuit",
    title: "DC circuits",
    subject: "Physics",
    description: "Two resistors. Two topologies. One conservation law.",
    defaults: { voltage: 12, r1: 4, r2: 8, connection: "series" },
    parameters: [
      numeric("voltage", "Supply voltage", "V", 0, 100, 0.1),
      numeric("r1", "Resistance R₁", "Ω", 0.1, 100, 0.1),
      numeric("r2", "Resistance R₂", "Ω", 0.1, 100, 0.1),
      {
        key: "connection",
        label: "Connection",
        options: ["series", "parallel"],
      },
    ],
    assumptions:
      "Ideal DC voltage source, two positive ohmic resistors and resistance-free wires. Diagram is schematic.",
    xLabel: "Supply voltage (V)",
    yLabel: "Total current (A)",
  },
  {
    id: "lens",
    title: "Thin lens",
    subject: "Physics",
    description: "Trace light from an object to its image.",
    defaults: { focalLength: 10, objectDistance: 30, objectHeight: 5 },
    parameters: [
      numeric("focalLength", "Focal length", "cm", 1, 50, 0.1),
      numeric("objectDistance", "Object distance", "cm", 1, 100, 0.1),
      numeric("objectHeight", "Object height", "cm", 0.1, 20, 0.1),
    ],
    assumptions:
      "Converging thin lens in air; paraxial approximation. Real-is-positive convention: real object distance u > 0, real image v > 0. 1/f = 1/u + 1/v. Magnification m = −v/u.",
    xLabel: "Object distance (cm)",
    yLabel: "Image distance (cm)",
  },
  {
    id: "stoichiometry",
    title: "Limiting reagent",
    subject: "Chemistry",
    description: "Balance a reaction, then find what runs out first.",
    defaults: { hydrogen: 4, oxygen: 1 },
    parameters: [
      numeric("hydrogen", "Hydrogen H₂", "mol", 0, 20, 0.1),
      numeric("oxygen", "Oxygen O₂", "mol", 0, 20, 0.1),
    ],
    assumptions:
      "Specific complete reaction: 2 H₂ + O₂ → 2 H₂O. Pure reagents, 100% theoretical yield; no competing reactions. Not a general reaction solver.",
    xLabel: "Reaction extent (mol)",
    yLabel: "Water produced (mol)",
  },
  {
    id: "dilution",
    title: "Dilution",
    subject: "Chemistry",
    description: "Keep the solute, change the concentration.",
    defaults: { concentration: 2, initialVolume: 100, finalVolume: 500 },
    parameters: [
      numeric("concentration", "Initial concentration", "mol/L", 0, 10, 0.01),
      numeric("initialVolume", "Initial volume", "mL", 1, 1000, 1),
      numeric("finalVolume", "Final volume", "mL", 1, 2000, 1),
    ],
    assumptions:
      "Solute is conserved, no reaction or loss. Final volume must be at least initial volume. Volumes refer to solution, not added solvent.",
    xLabel: "Solution volume (mL)",
    yLabel: "Concentration (mol/L)",
  },
  {
    id: "kinetics",
    title: "First-order kinetics",
    subject: "Chemistry",
    description: "Watch a concentration decay over time.",
    defaults: { initialConcentration: 1, rate: 0.1, time: 30 },
    parameters: [
      numeric(
        "initialConcentration",
        "Initial concentration",
        "mol/L",
        0,
        10,
        0.01,
      ),
      numeric("rate", "Rate constant", "s⁻¹", 0, 2, 0.01),
      numeric("time", "Observation window", "s", 1, 120, 1),
    ],
    assumptions:
      "Irreversible first-order decay at constant temperature and rate constant. C(t) = C₀ exp(−kt).",
    xLabel: "Time (s)",
    yLabel: "Concentration (mol/L)",
    timeDependent: true,
  },
  {
    id: "quadratic",
    title: "Quadratic explorer",
    subject: "Maths",
    description: "Move the coefficients. Discover the shape.",
    defaults: { a: 1, b: -4, c: 3 },
    parameters: [
      numeric("a", "Coefficient a", "", -5, 5, 0.1),
      numeric("b", "Coefficient b", "", -10, 10, 0.1),
      numeric("c", "Constant c", "", -10, 10, 0.1),
    ],
    assumptions:
      "Real coefficients and real-coordinate graph of y = ax² + bx + c. If a = 0, the model becomes linear or constant. Complex roots are reported separately.",
    xLabel: "x",
    yLabel: "y",
  },
  {
    id: "intersection",
    title: "Circle & line",
    subject: "Maths",
    description: "Explore crossings, tangency and separation.",
    defaults: { radius: 5, slope: 1, intercept: 0 },
    parameters: [
      numeric("radius", "Circle radius", "", 0.1, 10, 0.1),
      numeric("slope", "Line slope", "", -5, 5, 0.1),
      numeric("intercept", "y-intercept", "", -15, 15, 0.1),
    ],
    assumptions:
      "Circle centred at (0,0): x² + y² = r². Nonvertical line y = mx + c. Coordinates use one common unit.",
    xLabel: "x",
    yLabel: "y",
  },
  {
    id: "inheritance",
    title: "Monohybrid inheritance",
    subject: "Biology",
    description: "Build a Punnett square from two parents.",
    defaults: { parent1: "Aa", parent2: "Aa" },
    parameters: [
      { key: "parent1", label: "Parent one", options: ["AA", "Aa", "aa"] },
      { key: "parent2", label: "Parent two", options: ["AA", "Aa", "aa"] },
    ],
    assumptions:
      "One autosomal locus, Mendelian segregation, equal gamete probability, complete dominance of A and no viability differences. Probabilities describe offspring, not a guaranteed family ratio.",
    xLabel: "Genotype",
    yLabel: "Probability",
  },
  {
    id: "mitosis",
    title: "Mitosis",
    subject: "Biology",
    description: "Track chromosomes and DNA through cell division.",
    defaults: { chromosomes: 4, stage: "G1" },
    parameters: [
      numeric("chromosomes", "Diploid chromosome count", "2n", 2, 46, 2),
      {
        key: "stage",
        label: "Cell-cycle stage",
        options: [
          "G1",
          "G2",
          "Prophase",
          "Metaphase",
          "Anaphase",
          "Telophase",
          "After cytokinesis",
        ],
      },
    ],
    assumptions:
      "Conceptual diploid cell; chromosome count is by centromeres. DNA amount C is relative to a haploid unreplicated genome. Anaphase counts are for the whole dividing cell; after cytokinesis counts are per daughter.",
    xLabel: "Stage",
    yLabel: "DNA content (C)",
  },
];
export function validateParameters(id: ModelId, input: Parameters): string[] {
  const model = labs.find((x) => x.id === id);
  if (!model) return ["Unknown model."];
  const errors: string[] = [];
  for (const p of model.parameters) {
    const v = input[p.key];
    if (p.options) {
      if (!p.options.includes(String(v)))
        errors.push(`${p.label}: select a supported option.`);
    } else if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v < (p.min ?? -Infinity) ||
      v > (p.max ?? Infinity)
    )
      errors.push(
        `${p.label} must be between ${p.min} and ${p.max}${p.unit ? " " + p.unit : ""}.`,
      );
  }
  if (
    id === "incline" &&
    Number(input.kineticFriction) > Number(input.staticFriction)
  )
    errors.push("Kinetic friction must not exceed static friction.");
  if (
    id === "dilution" &&
    Number(input.finalVolume) < Number(input.initialVolume)
  )
    errors.push("Final volume must be at least the initial volume.");
  if (id === "mitosis" && Number(input.chromosomes) % 2 !== 0)
    errors.push("Choose an even diploid chromosome count.");
  return errors;
}
const metric = (
  label: string,
  value: Metric["value"],
  unit?: string,
): Metric => ({ label, value, unit });
const sample = (
  end: number,
  fn: (x: number) => number,
  start = 0,
  n = 100,
): Point[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const x = start + ((end - start) * i) / n;
    return { x, y: fn(x) };
  });
export function computeModel(id: ModelId, p: Parameters): ModelResult {
  const errors = validateParameters(id, p);
  if (errors.length) throw new Error(errors.join(" "));
  const n = (key: string) => Number(p[key]);
  switch (id) {
    case "projectile": {
      const v = n("speed"),
        theta = (n("angle") * Math.PI) / 180,
        h = n("height"),
        g = n("gravity"),
        vx = v * Math.cos(theta),
        vy = v * Math.sin(theta),
        t = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g,
        range = vx * t,
        maxHeight = h + (vy * vy) / (2 * g),
        impactSpeed = Math.sqrt(v * v + 2 * g * h);
      return {
        metrics: [
          metric("Flight time", t, "s"),
          metric("Range", range, "m"),
          metric("Maximum height", maxHeight, "m"),
          metric("Impact speed", impactSpeed, "m/s"),
        ],
        points: sample(t, (s) => h + vy * s - 0.5 * g * s * s).map((pt) => ({
          x: vx * pt.x,
          y: Math.max(0, pt.y),
        })),
        duration: t,
        working: [
          "vₓ = v₀ cos θ; vᵧ₀ = v₀ sin θ",
          "x(t) = vₓt; y(t) = h₀ + vᵧ₀t − ½gt²",
          "Set y(T) = 0: T = (vᵧ₀ + √(vᵧ₀² + 2gh₀))/g",
          "R = vₓT; H = h₀ + vᵧ₀²/(2g)",
        ],
        values: {
          vx,
          vy,
          t,
          range,
          maxHeight,
          impactSpeed,
          height: h,
          gravity: g,
        },
      };
    }
    case "incline": {
      const theta = (n("angle") * Math.PI) / 180,
        m = n("mass"),
        g = n("gravity"),
        normal = m * g * Math.cos(theta),
        parallel = m * g * Math.sin(theta),
        staticLimit = n("staticFriction") * normal,
        held = parallel <= staticLimit + 1e-10,
        friction = held ? parallel : n("kineticFriction") * normal,
        acceleration = held ? 0 : (parallel - friction) / m;
      return {
        metrics: [
          metric("Regime", held ? "Static equilibrium" : "Sliding down"),
          metric("Acceleration", acceleration, "m/s²"),
          metric("Normal force", normal, "N"),
          metric("Friction force", friction, "N"),
        ],
        points: sample(5, (t) => 0.5 * acceleration * t * t),
        duration: 5,
        working: [
          "N = mg cos θ; F∥ = mg sin θ",
          "If F∥ ≤ μₛN, static friction balances F∥ and a = 0.",
          "Otherwise fₖ = μₖN and a = g(sin θ − μₖ cos θ).",
          "Starting from rest: s(t) = ½at².",
        ],
        values: {
          normal,
          parallel,
          friction,
          acceleration,
          held: held ? "yes" : "no",
        },
      };
    }
    case "spring": {
      const m = n("mass"),
        k = n("stiffness"),
        A = n("amplitude"),
        phase = (n("phase") * Math.PI) / 180,
        omega = Math.sqrt(k / m),
        period = (2 * Math.PI) / omega,
        energy = 0.5 * k * A * A;
      return {
        metrics: [
          metric("Period", period, "s"),
          metric("Angular frequency", omega, "rad/s"),
          metric("Total energy", energy, "J"),
          metric("Peak speed", A * omega, "m/s"),
        ],
        points: sample(period * 2, (t) => A * Math.cos(omega * t + phase)),
        duration: period * 2,
        working: [
          "ω = √(k/m); T = 2π/ω",
          "x(t) = A cos(ωt + φ)",
          "v(t) = −Aω sin(ωt + φ)",
          "E = ½kA² = ½kx² + ½mv²",
        ],
        values: { omega, period, energy, phase, amplitude: A },
      };
    }
    case "circuit": {
      const V = n("voltage"),
        r1 = n("r1"),
        r2 = n("r2"),
        series = p.connection === "series",
        resistance = series ? r1 + r2 : (r1 * r2) / (r1 + r2),
        current = V / resistance,
        v1 = series ? current * r1 : V,
        v2 = series ? current * r2 : V,
        i1 = series ? current : V / r1,
        i2 = series ? current : V / r2;
      return {
        metrics: [
          metric("Equivalent resistance", resistance, "Ω"),
          metric("Total current", current, "A"),
          metric("Total power", V * current, "W"),
          metric("Voltage across R₁", v1, "V"),
        ],
        points: sample(Math.max(24, V), (v) => v / resistance),
        working: [
          series
            ? "Series: Rₑq = R₁ + R₂; current is the same through both."
            : "Parallel: 1/Rₑq = 1/R₁ + 1/R₂; voltage is the same across both.",
          "I = V/Rₑq",
          "P = VI; power is dissipated as heat.",
        ],
        values: { resistance, current, v1, v2, i1, i2, power: V * current },
      };
    }
    case "lens": {
      const f = n("focalLength"),
        u = n("objectDistance"),
        singular = Math.abs(u - f) < 1e-9,
        v = singular ? null : (f * u) / (u - f),
        magnification = v === null ? null : -v / u;
      return {
        metrics: [
          metric("Image distance", v === null ? "At infinity" : v, "cm"),
          metric(
            "Magnification",
            magnification === null ? "Undefined" : magnification,
          ),
          metric(
            "Image type",
            v === null
              ? "Collimated rays"
              : v > 0
                ? "Real, inverted"
                : "Virtual, upright",
          ),
          metric(
            "Image height",
            magnification === null
              ? "Undefined"
              : magnification * n("objectHeight"),
            "cm",
          ),
        ],
        points: sample(100, (x) => (f * x) / (x - f), 1).filter(
          (pt) => Math.abs(pt.x - f) > 1 && Math.abs(pt.y) < 200,
        ),
        note: singular
          ? "Object is at the focus. The outgoing rays are parallel; there is no finite image plane."
          : undefined,
        working: [
          "1/f = 1/u + 1/v",
          "v = fu/(u − f); undefined when u = f",
          "m = −v/u; image height = m × object height",
        ],
        values: {
          imageDistance: v,
          magnification,
          focalLength: f,
          objectDistance: u,
        },
      };
    }
    case "stoichiometry": {
      const H = n("hydrogen"),
        O = n("oxygen"),
        extent = Math.min(H / 2, O),
        water = 2 * extent,
        hLeft = H - water,
        oLeft = O - extent,
        limiting =
          Math.abs(H / 2 - O) < 1e-9
            ? "Stoichiometric proportions"
            : H / 2 < O
              ? "Hydrogen (H₂)"
              : "Oxygen (O₂)";
      return {
        metrics: [
          metric("Water formed", water, "mol"),
          metric("Limiting reagent", limiting),
          metric("Hydrogen remaining", hLeft, "mol"),
          metric("Oxygen remaining", oLeft, "mol"),
        ],
        points: sample(extent, (x) => 2 * x),
        working: [
          "Balanced reaction: 2 H₂ + O₂ → 2 H₂O",
          "Reaction extent ξ = min(n(H₂)/2, n(O₂))",
          "n(H₂O) = 2ξ; n(H₂) remaining = n₀(H₂) − 2ξ",
          "n(O₂) remaining = n₀(O₂) − ξ",
        ],
        values: { extent, water, hLeft, oLeft, limiting },
      };
    }
    case "dilution": {
      const c = n("concentration"),
        v1 = n("initialVolume"),
        v2 = n("finalVolume"),
        final = (c * v1) / v2,
        moles = (c * v1) / 1000;
      return {
        metrics: [
          metric("Final concentration", final, "mol/L"),
          metric("Solute amount", moles, "mol"),
          metric("Volume increase", v2 - v1, "mL"),
          metric("Dilution factor", v2 / v1),
        ],
        points: sample(v2, (v) => (c * v1) / v, v1),
        working: [
          "Solute amount n = C₁V₁, with volume in litres.",
          "Conservation of solute: C₁V₁ = C₂V₂",
          "C₂ = C₁ × V₁/V₂",
        ],
        values: { finalConcentration: final, moles, volumeIncrease: v2 - v1 },
      };
    }
    case "kinetics": {
      const c = n("initialConcentration"),
        k = n("rate"),
        time = n("time"),
        final = c * Math.exp(-k * time),
        halfLife = k === 0 ? null : Math.LN2 / k;
      return {
        metrics: [
          metric("Final concentration", final, "mol/L"),
          metric(
            "Half-life",
            halfLife === null ? "Infinite (no decay)" : halfLife,
            "s",
          ),
          metric(
            "Fraction remaining",
            c === 0 ? "Undefined (C₀ = 0)" : Math.exp(-k * time),
          ),
          metric("Rate constant", k, "s⁻¹"),
        ],
        points: sample(time, (t) => c * Math.exp(-k * t)),
        duration: time,
        working: [
          "dC/dt = −kC",
          "C(t) = C₀ exp(−kt)",
          "For k > 0: t½ = ln(2)/k",
          "At k = 0 the concentration is constant.",
        ],
        values: {
          finalConcentration: final,
          halfLife,
          rate: k,
          initialConcentration: c,
        },
      };
    }
    case "quadratic": {
      const a = n("a"),
        b = n("b"),
        c = n("c"),
        d = b * b - 4 * a * c,
        vertexX = a !== 0 ? -b / (2 * a) : null,
        vertexY =
          vertexX === null ? null : a * vertexX * vertexX + b * vertexX + c;
      let roots: number[] = [];
      let rootLabel: string;
      if (a === 0) {
        if (b === 0) rootLabel = c === 0 ? "Every real x" : "No roots";
        else {
          roots = [-c / b];
          rootLabel = roots[0].toFixed(4);
        }
      } else if (d < 0) {
        rootLabel = `${(-b / (2 * a)).toFixed(3)} ± ${(Math.sqrt(-d) / (2 * Math.abs(a))).toFixed(3)}i`;
      } else {
        roots =
          d === 0
            ? [-b / (2 * a)]
            : [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
        rootLabel = roots.map((x) => Number(x.toFixed(4))).join(", ");
      }
      return {
        metrics: [
          metric(
            "Real function",
            a !== 0 ? "Quadratic" : b !== 0 ? "Linear" : "Constant",
          ),
          metric("Roots", rootLabel),
          metric(
            "Vertex",
            vertexX === null
              ? "Not defined"
              : `(${Number(vertexX.toFixed(3))}, ${Number(vertexY!.toFixed(3))})`,
          ),
          metric("Discriminant", a === 0 ? "Not applicable" : d),
        ],
        points: sample(10, (x) => a * x * x + b * x + c, -10),
        working: [
          "y = ax² + bx + c",
          "For a ≠ 0: Δ = b² − 4ac; x = (−b ± √Δ)/(2a)",
          "Vertex: xᵥ = −b/(2a), yᵥ = f(xᵥ)",
          "For a = 0 solve bx + c = 0 instead.",
        ],
        values: { discriminant: d, vertexX, vertexY, roots },
      };
    }
    case "intersection": {
      const r = n("radius"),
        m = n("slope"),
        c = n("intercept"),
        A = 1 + m * m,
        B = 2 * m * c,
        C = c * c - r * r,
        d = B * B - 4 * A * C,
        tangent = Math.abs(d) < 1e-9,
        roots =
          d < -1e-9
            ? []
            : tangent
              ? [-B / (2 * A)]
              : [(-B - Math.sqrt(d)) / (2 * A), (-B + Math.sqrt(d)) / (2 * A)],
        coords = roots
          .map(
            (x) =>
              `(${Number(x.toFixed(3))}, ${Number((m * x + c).toFixed(3))})`,
          )
          .join("; ");
      return {
        metrics: [
          metric("Intersections", roots.length),
          metric(
            "Case",
            roots.length === 0
              ? "Separate"
              : tangent
                ? "Tangent"
                : "Two crossings",
          ),
          metric("Coordinates", coords || "No real intersection"),
          metric("Centre-to-line distance", Math.abs(c) / Math.sqrt(1 + m * m)),
        ],
        points: sample(r, (x) => m * x + c, -r),
        working: [
          "Substitute y = mx + c into x² + y² = r².",
          "(1 + m²)x² + 2mcx + (c² − r²) = 0",
          "Discriminant < 0: no crossing; = 0: tangent; > 0: two crossings.",
        ],
        values: { roots, radius: r, slope: m, intercept: c, discriminant: d },
      };
    }
    case "inheritance": {
      const p1 = String(p.parent1),
        p2 = String(p.parent2),
        offspring = [...p1].flatMap((a) =>
          [...p2].map((b) => [a, b].sort().join("")),
        ),
        AA = offspring.filter((x) => x === "AA").length / 4,
        Aa = offspring.filter((x) => x === "Aa").length / 4,
        aa = offspring.filter((x) => x === "aa").length / 4;
      return {
        metrics: [
          metric("AA probability", AA * 100, "%"),
          metric("Aa probability", Aa * 100, "%"),
          metric("aa probability", aa * 100, "%"),
          metric("Dominant phenotype", (AA + Aa) * 100, "%"),
        ],
        points: [
          { x: 0, y: AA },
          { x: 1, y: Aa },
          { x: 2, y: aa },
        ],
        working: [
          `Parent gametes: ${p1[0]}, ${p1[1]} and ${p2[0]}, ${p2[1]}.`,
          "Each Punnett square cell has probability ¼.",
          "Combine alleles, count genotypes, then apply complete dominance.",
        ],
        values: { AA, Aa, aa, offspring: offspring.join(",") },
      };
    }
    case "mitosis": {
      const diploid = n("chromosomes"),
        stage = String(p.stage),
        after = stage === "After cytokinesis",
        g1 = stage === "G1",
        separated = stage === "Anaphase" || stage === "Telophase",
        chromosomes = separated ? diploid * 2 : diploid,
        dna = g1 || after ? 2 : 4,
        chromatids = g1 || after ? diploid : diploid * 2;
      return {
        metrics: [
          metric("Chromosomes", chromosomes),
          metric("DNA amount", dna, "C"),
          metric("DNA molecules", chromatids),
          metric("Count basis", after ? "Per daughter cell" : "Whole cell"),
        ],
        points: [
          { x: 0, y: 2 },
          { x: 1, y: 4 },
          { x: 2, y: 4 },
          { x: 3, y: 4 },
          { x: 4, y: 4 },
          { x: 5, y: 4 },
          { x: 6, y: 2 },
        ],
        working: [
          "DNA replication in S phase doubles DNA, not chromosome count.",
          "Before anaphase, each replicated chromosome has two sister chromatids.",
          "At anaphase, separated chromatids are counted as chromosomes.",
          "Cytokinesis produces two daughter cells, each with the original diploid count.",
        ],
        values: { chromosomes, dna, chromatids, stage },
      };
    }
  }
}
export function formatValue(value: Metric["value"], precision = 3): string {
  if (value === null) return "Not defined";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "Not defined";
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) > 1e6))
    return value.toExponential(2);
  return String(Number(value.toFixed(precision)));
}
