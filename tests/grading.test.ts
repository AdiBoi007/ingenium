import { describe, it, expect } from "vitest";
import {
  gradeAnswer,
  parseNumerical,
  scheduleReview,
} from "../src/domain/grading";
import { originalQuestions } from "../src/domain/question-seed";
describe("Question grading and review rules", () => {
  it("seeds exactly sixty distinct original questions", () => {
    expect(originalQuestions).toHaveLength(60);
    expect(new Set(originalQuestions.map((q) => q.id)).size).toBe(60);
    for (const q of originalQuestions) {
      expect(gradeAnswer(q, q.answer).status).toBe(
        q.type === "free" ? "needs_review" : "correct",
      );
    }
  });
  it("distinguishes blank, malformed, incorrect and correct", () => {
    const q = {
      type: "numerical" as const,
      answer: "2",
      unit: "m",
      tolerance: 0.01,
    };
    expect(gradeAnswer(q, "").status).toBe("blank");
    expect(gradeAnswer(q, "alert(1)").status).toBe("malformed");
    expect(gradeAnswer(q, "3").status).toBe("incorrect");
    expect(gradeAnswer(q, "200 cm").status).toBe("correct");
  });
  it("converts compatible units and rejects incompatible or nonfinite input", () => {
    expect(parseNumerical("36 km/h", "m/s").value).toBe(10);
    expect(parseNumerical("2 kg", "m").valid).toBe(false);
    expect(parseNumerical("1e999", "m").valid).toBe(false);
    expect(parseNumerical("Infinity").valid).toBe(false);
  });
  it("uses explicit multiple-choice exact matching without duplicate inflation", () => {
    const q = { type: "multiple" as const, answer: ["A", "B"] };
    expect(gradeAnswer(q, ["B", "A", "A"]).correct).toBe(true);
    expect(gradeAnswer(q, ["A"]).score).toBe(-1);
    expect(gradeAnswer(q, ["A"], { partialCredit: true }).score).toBe(2);
  });
  it("honours grading policy overrides and tolerances", () => {
    expect(
      gradeAnswer({ type: "single", answer: "A" }, "B", { incorrect: 0 }).score,
    ).toBe(0);
    expect(
      gradeAnswer(
        {
          type: "numerical",
          answer: "100",
          tolerance: 0,
          relativeTolerance: 0.01,
        },
        "100.9",
      ).correct,
    ).toBe(true);
  });
  it("never invents a deterministic score for free response", () => {
    expect(
      gradeAnswer({ type: "free", answer: "Rubric" }, "Reasoned response")
        .status,
    ).toBe("needs_review");
  });
  it("schedules actual review ratings by the versioned rule", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(scheduleReview("again", 0, now).dueAt).toBe(
      "2026-01-02T00:00:00.000Z",
    );
    expect(scheduleReview("good", 0, now).intervalDays).toBe(3);
    expect(scheduleReview("easy", 3, now).intervalDays).toBe(9);
  });
});
