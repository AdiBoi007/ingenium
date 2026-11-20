export type QuestionType = "single" | "multiple" | "numerical" | "free";
export type GradeQuestion = {
  type: QuestionType;
  answer: string | string[] | number;
  unit?: string;
  tolerance?: number;
  relativeTolerance?: number;
  policy?: Partial<ScoringPolicy>;
};
export type ScoringPolicy = {
  correct: number;
  incorrect: number;
  blank: number;
  partialCredit: boolean;
};
export type GradeResult = {
  status: "correct" | "incorrect" | "blank" | "malformed" | "needs_review";
  correct: boolean;
  score: number;
  normalizedAnswer?: number;
};
export const CUSTOM_POLICY: ScoringPolicy = {
  correct: 4,
  incorrect: -1,
  blank: 0,
  partialCredit: false,
};
const units: Record<string, { dimension: string; scale: number }> = {
  m: { dimension: "length", scale: 1 },
  cm: { dimension: "length", scale: 0.01 },
  mm: { dimension: "length", scale: 0.001 },
  km: { dimension: "length", scale: 1000 },
  s: { dimension: "time", scale: 1 },
  ms: { dimension: "time", scale: 0.001 },
  min: { dimension: "time", scale: 60 },
  h: { dimension: "time", scale: 3600 },
  kg: { dimension: "mass", scale: 1 },
  g: { dimension: "mass", scale: 0.001 },
  "m/s": { dimension: "speed", scale: 1 },
  "km/h": { dimension: "speed", scale: 1 / 3.6 },
  "m/s²": { dimension: "acceleration", scale: 1 },
  "m/s^2": { dimension: "acceleration", scale: 1 },
  N: { dimension: "force", scale: 1 },
  J: { dimension: "energy", scale: 1 },
  kJ: { dimension: "energy", scale: 1000 },
  W: { dimension: "power", scale: 1 },
  V: { dimension: "voltage", scale: 1 },
  A: { dimension: "current", scale: 1 },
  Ω: { dimension: "resistance", scale: 1 },
  ohm: { dimension: "resistance", scale: 1 },
  mol: { dimension: "amount", scale: 1 },
  L: { dimension: "volume", scale: 1 },
  mL: { dimension: "volume", scale: 0.001 },
  "mol/L": { dimension: "concentration", scale: 1 },
  "%": { dimension: "percent", scale: 1 },
};
export function parseNumerical(
  input: string | number,
  expectedUnit?: string,
): { valid: boolean; value?: number } {
  const raw = String(input).trim();
  const match = raw.match(
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([^\d\s].*)?$/,
  );
  if (!match) return { valid: false };
  let value = Number(match[1]);
  if (!Number.isFinite(value)) return { valid: false };
  const given = match[2]?.trim();
  if (given) {
    if (!expectedUnit) return { valid: false };
    const source = units[given],
      target = units[expectedUnit];
    if (!source || !target || source.dimension !== target.dimension)
      return { valid: false };
    value = (value * source.scale) / target.scale;
  }
  return { valid: true, value };
}
export function gradeAnswer(
  question: GradeQuestion,
  studentAnswer: unknown,
  policy: Partial<ScoringPolicy> = {},
): GradeResult {
  const scoring = { ...CUSTOM_POLICY, ...policy, ...question.policy };
  const blank =
    studentAnswer === null ||
    studentAnswer === undefined ||
    (typeof studentAnswer === "string" && !studentAnswer.trim()) ||
    (Array.isArray(studentAnswer) && !studentAnswer.length);
  if (blank) return { status: "blank", correct: false, score: scoring.blank };
  if (question.type === "free")
    return { status: "needs_review", correct: false, score: 0 };
  let correct = false;
  let normalizedAnswer: number | undefined;
  if (question.type === "numerical") {
    if (typeof studentAnswer !== "string" && typeof studentAnswer !== "number")
      return { status: "malformed", correct: false, score: 0 };
    const parsed = parseNumerical(studentAnswer, question.unit);
    if (!parsed.valid) return { status: "malformed", correct: false, score: 0 };
    normalizedAnswer = parsed.value!;
    const expected = Number(question.answer);
    if (!Number.isFinite(expected))
      return { status: "needs_review", correct: false, score: 0 };
    const tolerance = Math.max(
      question.tolerance ?? 0.001,
      Math.abs(expected) * (question.relativeTolerance ?? 0),
    );
    correct =
      Math.abs(normalizedAnswer - expected) <= tolerance + Number.EPSILON * 8;
  } else if (question.type === "multiple") {
    if (
      !Array.isArray(studentAnswer) ||
      !studentAnswer.every((x) => typeof x === "string")
    )
      return { status: "malformed", correct: false, score: 0 };
    const actual = [...new Set(studentAnswer)].sort(),
      expected = [
        ...new Set(
          Array.isArray(question.answer)
            ? question.answer
            : [String(question.answer)],
        ),
      ].sort();
    correct =
      actual.length === expected.length &&
      actual.every((x, i) => x === expected[i]);
    if (
      !correct &&
      scoring.partialCredit &&
      actual.every((x) => expected.includes(x))
    )
      return {
        status: "incorrect",
        correct: false,
        score: (scoring.correct * actual.length) / expected.length,
      };
  } else
    correct = String(studentAnswer).trim() === String(question.answer).trim();
  return {
    status: correct ? "correct" : "incorrect",
    correct,
    score: correct ? scoring.correct : scoring.incorrect,
    normalizedAnswer,
  };
}
export type ReviewRating = "again" | "hard" | "good" | "easy";
export function scheduleReview(
  rating: ReviewRating,
  previousInterval = 0,
  now = new Date(),
): { ruleVersion: string; intervalDays: number; dueAt: string } {
  const base = Math.max(1, previousInterval);
  const intervalDays =
    rating === "again"
      ? 1
      : rating === "hard"
        ? Math.max(1, Math.round(base * 1.2))
        : rating === "good"
          ? Math.max(3, Math.round(base * 2))
          : Math.max(7, Math.round(base * 3));
  return {
    ruleVersion: "ingenium-spaced-v1",
    intervalDays,
    dueAt: new Date(now.getTime() + intervalDays * 86400000).toISOString(),
  };
}

/** Human-reviewed questions never silently earn zero in an automatic score. */
export function summarizeTestScore(
  items: {
    question: Pick<GradeQuestion, "type" | "policy">;
    grade?: Pick<GradeResult, "status" | "score">;
  }[],
  policy: Partial<ScoringPolicy> = {},
) {
  let automaticScore = 0;
  let automaticMaxScore = 0;
  let ungradedQuestionCount = 0;
  let pendingSelfReviewCount = 0;
  for (const item of items) {
    if (item.grade?.status === "needs_review") pendingSelfReviewCount++;
    if (
      item.question.type === "free" ||
      item.grade?.status === "needs_review"
    ) {
      ungradedQuestionCount++;
      continue;
    }
    automaticScore += item.grade?.score ?? 0;
    automaticMaxScore +=
      item.question.policy?.correct ?? policy.correct ?? CUSTOM_POLICY.correct;
  }
  return {
    automaticScore,
    automaticMaxScore,
    ungradedQuestionCount,
    pendingSelfReviewCount,
    automaticallyGradedQuestionCount: items.length - ungradedQuestionCount,
    scoringComplete: ungradedQuestionCount === 0,
  };
}
