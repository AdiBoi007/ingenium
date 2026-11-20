import { z } from "zod";
import {
  ApiError,
  camel,
  id,
  query,
  projectExists,
  requireTool,
  scoped,
  transaction,
} from "./db";
import { insertRow } from "./entities";
const toMinutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const toTime = (minutes: number) =>
  `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
import { getCurriculum } from "./curriculum";
export type PlanWorkload = {
  title: string;
  subject?: string;
  minutes?: number;
  topicId?: string;
  priority?: number;
  dueDate?: string;
  key?: string;
  requires?: string[];
  blockedReason?: string;
};
export type PlanningTopic = {
  id: string;
  title: string;
  subject: string;
  coverage: string;
  active: boolean;
  prerequisiteIds: string[];
};
const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function prepareCurriculumWorkloads(
  input: (PlanWorkload | string)[],
  topics: PlanningTopic[],
): PlanWorkload[] {
  const active = topics.filter((t) => t.active);
  const workloads: PlanWorkload[] = input.map((value, index) => {
    const work = typeof value === "string" ? { title: value } : value;
    const exact = active.filter(
      (t) =>
        (!work.subject || t.subject === work.subject) &&
        normalized(t.title) === normalized(work.title),
    );
    const matches = work.topicId
      ? active.filter((t) => t.id === work.topicId)
      : exact.length
        ? exact
        : active.filter(
            (t) =>
              (!work.subject || t.subject === work.subject) &&
              normalized(work.title).includes(normalized(t.title)),
          );
    if (work.topicId && !matches.length)
      throw new ApiError(
        400,
        "A workload references a topic outside this project",
      );
    const match = matches.length === 1 ? matches[0] : undefined;
    return {
      ...work,
      key: String(index),
      topicId: match?.id,
      subject: work.subject ?? match?.subject,
      requires: [],
    };
  });
  for (const work of workloads) {
    const topic = active.find((t) => t.id === work.topicId);
    if (!topic) continue;
    for (const prerequisiteId of topic.prerequisiteIds) {
      const pre = active.find((t) => t.id === prerequisiteId);
      if (pre?.coverage === "covered") continue;
      const included = workloads.filter((w) => w.topicId === prerequisiteId);
      if (!included.length) {
        work.blockedReason = `Complete or include prerequisite: ${pre?.title ?? "an unavailable prerequisite topic"}`;
        break;
      }
      work.requires!.push(...included.map((w) => w.key!));
    }
  }
  const sorted: PlanWorkload[] = [];
  const visiting = new Set<string>(),
    done = new Set<string>();
  const ordered = [...workloads].sort(
    (a, b) =>
      (a.priority ?? 2) - (b.priority ?? 2) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
  );
  const visit = (work: PlanWorkload) => {
    if (done.has(work.key!)) return;
    if (visiting.has(work.key!))
      throw new ApiError(400, "The curriculum contains a prerequisite cycle");
    visiting.add(work.key!);
    for (const key of work.requires ?? []) {
      const pre = workloads.find((w) => w.key === key)!;
      visit(pre);
      if (pre.blockedReason)
        work.blockedReason = `Prerequisite workload is blocked: ${pre.title}`;
    }
    visiting.delete(work.key!);
    done.add(work.key!);
    sorted.push(work);
  };
  for (const work of ordered) visit(work);
  return sorted;
}
export function allocatePlan(input: {
  startDate: string;
  endDate: string;
  minutesPerDay: number;
  sessionMinutes: number;
  topics: (PlanWorkload | string)[];
  existing: { date: string; time: string; duration: number; status?: string }[];
  startTime?: string;
}) {
  const tasks: any[] = [];
  const workloads = input.topics.map((topic, index) => {
    const work = typeof topic === "string" ? { title: topic } : topic;
    return {
      ...work,
      key: work.key ?? String(index),
      subject: work.subject ?? "",
      remaining: work.minutes ?? input.sessionMinutes,
    };
  });
  const start = new Date(input.startDate + "T12:00:00Z"),
    end = new Date(input.endDate + "T12:00:00Z");
  let capacityMinutes = 0;
  for (
    let date = new Date(start);
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const key = date.toISOString().slice(0, 10);
    const dayStart = toMinutes(input.startTime ?? "09:00");
    const dayEnd = Math.min(24 * 60, dayStart + input.minutesPerDay);
    const occupied = input.existing
      .filter((task) => task.date === key && task.status !== "cancelled")
      .map((task) => ({
        start: toMinutes(task.time),
        end: toMinutes(task.time) + task.duration,
      }))
      .sort((a, b) => a.start - b.start);
    const free: { start: number; end: number }[] = [];
    let cursor = dayStart;
    for (const block of occupied) {
      if (block.end <= dayStart || block.start >= dayEnd) continue;
      if (block.start > cursor)
        free.push({ start: cursor, end: Math.min(block.start, dayEnd) });
      cursor = Math.max(cursor, block.end);
    }
    if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
    capacityMinutes += free.reduce(
      (sum, block) => sum + block.end - block.start,
      0,
    );
    for (const block of free) {
      let cursor = block.start;
      for (const workload of workloads) {
        if (
          workload.blockedReason ||
          (workload.requires ?? []).some(
            (pre) => workloads.find((w) => w.key === pre)!.remaining > 0,
          )
        )
          continue;
        if (workload.dueDate && key > workload.dueDate) continue;
        while (
          workload.remaining > 0 &&
          block.end - cursor >= Math.min(15, workload.remaining)
        ) {
          const duration = Math.min(
            input.sessionMinutes,
            workload.remaining,
            block.end - cursor,
          );
          if (duration < Math.min(15, workload.remaining)) break;
          tasks.push({
            id: id("planned"),
            title: workload.title,
            date: key,
            time: toTime(cursor),
            duration,
            subject: workload.subject,
            type: "study",
            status: "pending",
            fixed: false,
            metadata: workload.topicId ? { topicId: workload.topicId } : {},
          });
          workload.remaining -= duration;
          cursor += duration + 5;
        }
      }
    }
  }
  return {
    tasks,
    capacityMinutes,
    scheduledMinutes: tasks.reduce((sum, task) => sum + task.duration, 0),
    unscheduledMinutes: workloads.reduce((sum, w) => sum + w.remaining, 0),
    unscheduled: workloads
      .filter((w) => w.remaining > 0)
      .map((w) => ({
        title: w.title,
        minutes: w.remaining,
        reason:
          w.blockedReason ||
          (w.requires ?? []).some(
            (pre) => workloads.find((x) => x.key === pre)!.remaining > 0,
          )
            ? w.blockedReason ||
              "Prerequisite work could not fit before this topic."
            : w.dueDate
              ? "Insufficient capacity before the due date."
              : "Insufficient available capacity.",
      })),
    explanation:
      "Study blocks stay in the daily window, leave five-minute breaks and avoid existing tasks. Matched curriculum prerequisites are scheduled first; uncovered prerequisites missing from the workload leave dependent work unscheduled. Fixed and completed work stays in place.",
  };
}
export async function previewPlan(projectId: string, body: any) {
  await requireTool(projectId, "plan");
  const project = await projectExists(projectId);
  body = {
    minutesPerDay:
      project.settings.minutesPerDay ??
      project.settings.availableMinutes ??
      120,
    startTime: project.settings.studyStart ?? "09:00",
    ...body,
  };
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(v + "T12:00:00Z");
      return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
    }, "Choose a valid calendar date");
  const parsed = z
    .object({
      startDate: date,
      endDate: date,
      minutesPerDay: z.number().int().min(15).max(720).default(120),
      sessionMinutes: z.number().int().min(15).max(180).default(30),
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .default("09:00"),
      topics: z
        .array(
          z.union([
            z.string().min(1),
            z.object({
              title: z.string().min(1),
              subject: z.string().optional(),
              topicId: z.string().optional(),
              minutes: z.number().int().min(1).max(10000).optional(),
              priority: z.number().int().min(1).max(3).optional(),
              dueDate: date.optional(),
            }),
          ]),
        )
        .max(100),
      title: z.string().max(200).default("Your study plan"),
    })
    .safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      400,
      "Check your plan dates and study time",
      parsed.error.flatten(),
    );
  const input = parsed.data;
  const days =
    (new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) /
    86400000;
  if (!Number.isFinite(days) || days < 0 || days > 90)
    throw new ApiError(400, "Choose a date range of up to 90 days");
  const existing = (
    await query(
      "SELECT * FROM tasks WHERE project_id=$1 AND date BETWEEN $2 AND $3",
      [projectId, input.startDate, input.endDate],
    )
  ).rows.map(camel);
  const curriculum = await getCurriculum(projectId);
  const workloads = prepareCurriculumWorkloads(input.topics, curriculum.topics);
  const payload = {
    ...allocatePlan({ ...input, topics: workloads, existing }),
    curriculumRevision: curriculum.template.revision,
    matchedTopics: workloads
      .filter((w) => w.topicId)
      .map((w) => ({ title: w.title, topicId: w.topicId })),
    unmappedTopics: workloads.filter((w) => !w.topicId).map((w) => w.title),
  };
  const item = await insertRow("plans", {
    id: id("plan"),
    projectId,
    title: input.title,
    payload,
  });
  return { ...item, ...payload };
}
export async function applyPlan(projectId: string, planId: string) {
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      projectId + ":calendar",
    ]);
    const found = await query(
      "SELECT * FROM plans WHERE project_id=$1 AND id=$2 FOR UPDATE",
      [projectId, planId],
      client,
    );
    if (!found.rows[0]) throw new ApiError(404, "Plan not found");
    const plan = found.rows[0];
    if (plan.status === "applied") return { ...camel(plan), ...plan.payload };
    if (plan.status === "reverted")
      throw new ApiError(
        409,
        "This plan was reverted. Generate a fresh preview.",
      );
    if (plan.payload.curriculumRevision) {
      const current = (
        await query(
          "SELECT revision FROM project_curriculum WHERE project_id=$1",
          [projectId],
          client,
        )
      ).rows[0];
      if (current?.revision !== plan.payload.curriculumRevision)
        throw new ApiError(
          409,
          "Your curriculum changed since this preview. Generate a fresh plan.",
        );
    }
    for (const task of plan.payload.tasks) {
      const conflicts = await query(
        "SELECT id FROM tasks WHERE project_id=$1 AND date=$2 AND status!='cancelled' AND (substring(time,1,2)::int*60+substring(time,4,2)::int)<$4 AND (substring(time,1,2)::int*60+substring(time,4,2)::int+duration)>$3",
        [
          projectId,
          task.date,
          toMinutes(task.time),
          toMinutes(task.time) + task.duration,
        ],
        client,
      );
      if (conflicts.rowCount)
        throw new ApiError(
          409,
          "Your calendar changed since this preview. Generate a fresh plan.",
        );
      await insertRow(
        "tasks",
        { ...task, id: id("task"), projectId, planId },
        client,
      );
    }
    await query(
      "UPDATE plans SET status='applied',applied_at=now() WHERE project_id=$1 AND id=$2",
      [projectId, planId],
      client,
    );
    return { ...camel(plan), ...plan.payload, status: "applied" };
  });
}
export async function undoPlan(projectId: string, planId: string) {
  return transaction(async (client) => {
    const plan = await scoped("plans", projectId, planId, client);
    if (plan.status !== "applied")
      throw new ApiError(409, "Only an applied plan can be reverted");
    await query(
      "DELETE FROM tasks WHERE project_id=$1 AND plan_id=$2 AND status='pending'",
      [projectId, planId],
      client,
    );
    await query(
      "UPDATE plans SET status='reverted' WHERE project_id=$1 AND id=$2",
      [projectId, planId],
      client,
    );
    return {
      ...camel(plan),
      status: "reverted",
      message:
        "Pending tasks from this plan were removed. Completed or in-progress work was retained.",
    };
  });
}
function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
export async function calendarIcs(projectId: string) {
  const tasks = (
    await query(
      "SELECT * FROM tasks WHERE project_id=$1 AND status!='cancelled' ORDER BY date,time",
      [projectId],
    )
  ).rows.map(camel);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ingenium//Learning calendar//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const task of tasks) {
    const date = task.date.replaceAll("-", "");
    const time = task.time.replace(":", "");
    const end = new Date(`${task.date}T${task.time}:00Z`);
    end.setUTCMinutes(end.getUTCMinutes() + task.duration);
    const endString = end.toISOString().replace(/[-:]/g, "").slice(0, 15);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${task.id}@ingenium.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;TZID=${task.timezone}:${date}T${time}00`,
      `DTEND;TZID=${task.timezone}:${endString}`,
      `SUMMARY:${escapeIcs(task.title)}`,
      `DESCRIPTION:${escapeIcs(task.subject + " · " + task.type)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
