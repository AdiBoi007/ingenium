import { describe, it, expect } from "vitest";
import { computeModel, labs, validateParameters } from "../src/domain/science";
describe("Scientific model reference cases", () => {
  it("contains and computes all twelve registered models", () => {
    expect(labs).toHaveLength(12);
    for (const lab of labs) {
      const r = computeModel(lab.id, lab.defaults);
      expect(r.metrics.length).toBeGreaterThan(0);
      expect(
        r.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      ).toBe(true);
    }
  });
  it("reproduces the projectile benchmark", () => {
    const r = computeModel("projectile", {
      speed: 20,
      angle: 30,
      height: 0,
      gravity: 10,
    });
    expect(r.values.t).toBeCloseTo(2);
    expect(r.values.range).toBeCloseTo(34.641016, 5);
    expect(r.values.maxHeight).toBeCloseTo(5);
  });
  it("handles vertical free fall and zero flight", () => {
    expect(
      computeModel("projectile", {
        speed: 0,
        angle: 0,
        height: 45,
        gravity: 10,
      }).values.t,
    ).toBe(3);
    expect(
      computeModel("projectile", { speed: 0, angle: 0, height: 0, gravity: 10 })
        .values.t,
    ).toBe(0);
  });
  it("handles static and sliding friction separately", () => {
    expect(
      computeModel("incline", {
        mass: 2,
        angle: 10,
        staticFriction: 0.5,
        kineticFriction: 0.3,
        gravity: 10,
      }).values.acceleration,
    ).toBe(0);
    expect(
      computeModel("incline", {
        mass: 2,
        angle: 30,
        staticFriction: 0.1,
        kineticFriction: 0,
        gravity: 10,
      }).values.acceleration,
    ).toBeCloseTo(5);
  });
  it("computes oscillator period and conserved energy", () => {
    const r = computeModel("spring", {
      mass: 1,
      stiffness: 4,
      amplitude: 2,
      phase: 0,
    });
    expect(r.values.period).toBeCloseTo(Math.PI);
    expect(r.values.energy).toBe(8);
  });
  it("distinguishes circuit topologies", () => {
    expect(
      computeModel("circuit", {
        voltage: 12,
        r1: 4,
        r2: 8,
        connection: "series",
      }).values.current,
    ).toBe(1);
    expect(
      computeModel("circuit", {
        voltage: 12,
        r1: 6,
        r2: 3,
        connection: "parallel",
      }).values.resistance,
    ).toBe(2);
  });
  it("preserves the thin-lens focal singularity", () => {
    expect(
      computeModel("lens", {
        focalLength: 10,
        objectDistance: 10,
        objectHeight: 2,
      }).values.imageDistance,
    ).toBeNull();
    expect(
      computeModel("lens", {
        focalLength: 10,
        objectDistance: 5,
        objectHeight: 2,
      }).values.imageDistance,
    ).toBe(-10);
  });
  it("conserves species in the explicit water reaction", () => {
    const r = computeModel("stoichiometry", { hydrogen: 4, oxygen: 1 });
    expect(r.values.water).toBe(2);
    expect(r.values.hLeft).toBe(2);
    expect(r.values.oLeft).toBe(0);
  });
  it("conserves solute and rejects concentration by evaporation", () => {
    expect(
      computeModel("dilution", {
        concentration: 2,
        initialVolume: 100,
        finalVolume: 500,
      }).values.finalConcentration,
    ).toBe(0.4);
    expect(
      validateParameters("dilution", {
        concentration: 2,
        initialVolume: 100,
        finalVolume: 50,
      }).length,
    ).toBeGreaterThan(0);
  });
  it("reports no finite half-life for zero-rate kinetics", () => {
    expect(
      computeModel("kinetics", { initialConcentration: 1, rate: 0, time: 30 })
        .values.halfLife,
    ).toBeNull();
  });
  it("handles quadratic, linear and constant degeneracies", () => {
    expect(
      computeModel("quadratic", { a: 1, b: -4, c: 3 }).values.roots,
    ).toEqual([1, 3]);
    expect(
      computeModel("quadratic", { a: 0, b: 2, c: -4 }).values.roots,
    ).toEqual([2]);
    expect(
      computeModel("quadratic", { a: 0, b: 0, c: 0 }).metrics[1].value,
    ).toBe("Every real x");
  });
  it("handles tangent and separate circle-line cases", () => {
    expect(
      computeModel("intersection", { radius: 5, slope: 0, intercept: 5 }).values
        .roots,
    ).toHaveLength(1);
    expect(
      computeModel("intersection", { radius: 5, slope: 0, intercept: 6 }).values
        .roots,
    ).toHaveLength(0);
  });
  it("computes Mendelian probabilities and chromosome conventions", () => {
    const r = computeModel("inheritance", { parent1: "Aa", parent2: "Aa" });
    expect(r.values.AA).toBe(0.25);
    expect(r.values.Aa).toBe(0.5);
    expect(r.values.aa).toBe(0.25);
    expect(
      computeModel("mitosis", { chromosomes: 4, stage: "Anaphase" }).values
        .chromosomes,
    ).toBe(8);
    expect(
      computeModel("mitosis", { chromosomes: 4, stage: "After cytokinesis" })
        .values.dna,
    ).toBe(2);
  });
  it("rejects NaN and unphysical parameters", () => {
    expect(() =>
      computeModel("projectile", {
        speed: NaN,
        angle: 30,
        height: 0,
        gravity: 10,
      }),
    ).toThrow();
    expect(
      validateParameters("incline", {
        mass: 1,
        angle: 30,
        gravity: 10,
        staticFriction: 0.1,
        kineticFriction: 0.5,
      }),
    ).not.toEqual([]);
  });
});
