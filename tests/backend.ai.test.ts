import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { id, pool, query } from "../src/server/db";
import { insertRow, getEntity } from "../src/server/entities";
import {
  aiToolDefinitions,
  executeAiTool,
  resolveAttachments,
  searchSourcePassages,
} from "../src/server/ai-tools";
import { runTutorRounds } from "../src/server/ai-runner";
vi.mock("openai", () => ({
  default: class FixtureOpenAI {
    responses = {
      create: async () => ({
        async *[Symbol.asyncIterator]() {
          yield {
            type: "response.output_text.delta",
            delta: "Fixture retry response.",
          };
          yield {
            type: "response.completed",
            response: {
              output: [],
              usage: { input_tokens: 1, output_tokens: 1 },
            },
          };
        },
      }),
    };
  },
}));
const projectId = id("ai-fixture"),
  otherProjectId = id("ai-other"),
  conversationId = id("conversation"),
  userId = id("user"),
  assistantId = id("assistant"),
  generationId = id("generation");
beforeAll(async () => {
  if (
    (await query("SELECT current_database() AS name")).rows[0].name !==
    "ingenium_demo"
  )
    throw new Error("Use the isolated demo database");
  for (const p of [projectId, otherProjectId])
    await insertRow("projects", {
      id: p,
      studentId: "adi-demo",
      name: "AI adapter test fixture",
      exam: "Custom",
      subjects: ["Physics"],
      settings: {
        enabledTools: ["ask", "solve", "visualise", "sources", "progress"],
      },
    });
  await insertRow("conversations", {
    id: conversationId,
    projectId,
    title: "Fixture conversation",
  });
  await insertRow("messages", {
    id: userId,
    projectId,
    conversationId,
    role: "user",
    content: "Original fixture problem.",
  });
  await insertRow("messages", {
    id: assistantId,
    projectId,
    conversationId,
    role: "assistant",
    content: "",
    status: "generating",
  });
  await insertRow("jobs", {
    id: generationId,
    projectId,
    type: "generation",
    status: "processing",
    payload: {
      assistantId,
      conversationId,
      userId,
      tool: "ask",
      subject: "Physics",
    },
  });
});
afterAll(async () => {
  await query("DELETE FROM projects WHERE id=ANY($1::text[])", [
    [projectId, otherProjectId],
  ]);
  await pool.end();
  vi.unstubAllEnvs();
});
const context = {
  projectId,
  conversationId,
  assistantId,
  generationId,
  callId: "test-call",
};
describe("allowlisted AI execution, with no provider credentials", () => {
  it("executes trusted science once and persists the message artifact link", async () => {
    const args = {
      modelId: "projectile",
      title: "Verified projectile",
      parameters: [
        { key: "speed", value: 20 },
        { key: "angle", value: 30 },
        { key: "height", value: 0 },
        { key: "gravity", value: 10 },
      ],
    };
    const first = await executeAiTool(context, "compute_simulation", args);
    expect(first.artifact.payload.result.values.range).toBeCloseTo(
      34.641016,
      5,
    );
    const retry = await executeAiTool(context, "compute_simulation", args);
    expect(retry.artifact.id).toBe(first.artifact.id);
    expect(retry.idempotent).toBe(true);
    expect(
      (
        await query("SELECT artifact_id FROM messages WHERE id=$1", [
          assistantId,
        ])
      ).rows[0].artifact_id,
    ).toBe(first.artifact.id);
    expect(
      Number(
        (
          await query("SELECT count(*) FROM artifacts WHERE project_id=$1", [
            projectId,
          ])
        ).rows[0].count,
      ),
    ).toBe(1);
  });
  it("rejects unregistered tools and model-selected project IDs", async () => {
    await expect(
      executeAiTool({ ...context, callId: "bad" }, "run_shell", {
        command: "anything",
      }),
    ).rejects.toThrow("Unknown AI tool");
    await expect(
      executeAiTool({ ...context, callId: "bad" }, "compute_simulation", {
        modelId: "projectile",
        title: "Bad scope",
        projectId: otherProjectId,
        parameters: [],
      }),
    ).rejects.toThrow();
    expect(
      Number(
        (
          await query("SELECT count(*) FROM artifacts WHERE project_id=$1", [
            otherProjectId,
          ])
        ).rows[0].count,
      ),
    ).toBe(0);
  });
  it("refuses tools after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeAiTool(
        { ...context, callId: "cancelled", signal: controller.signal },
        "compute_simulation",
        { modelId: "projectile", title: "Cancelled", parameters: [] },
      ),
    ).rejects.toThrow("Generation cancelled");
  });
  it("scopes selected lesson notes and does not invent transcript access", async () => {
    const lesson = await insertRow("lessons", {
      id: id("lesson"),
      projectId,
      title: "A fixture lesson",
      videoId: "kKKM8Y-u7ds",
      subject: "Physics",
    });
    await insertRow("resources", {
      id: id("note"),
      projectId,
      title: "A student note",
      type: "video-note",
      content: "My momentum explanation.",
      metadata: { lessonId: lesson.id, timestamp: 42 },
    });
    const sources = await resolveAttachments(projectId, [
      { id: lesson.id, type: "lesson" },
    ]);
    expect(sources[0].text).toContain("Transcript is unavailable");
    expect(sources[1].text).toContain("42 seconds");
    await expect(
      resolveAttachments(otherProjectId, [{ id: lesson.id, type: "lesson" }]),
    ).rejects.toThrow("Item not found in this project");
  });
  it("retries the same saved message with a fixture provider and no duplicate user message", async () => {
    await query(
      "UPDATE messages SET status='failed',content='Previously saved partial output.' WHERE id=$1",
      [assistantId],
    );
    await query("UPDATE jobs SET status='failed' WHERE id=$1", [generationId]);
    const userCount = Number(
      (
        await query(
          "SELECT count(*) FROM messages WHERE project_id=$1 AND role='user'",
          [projectId],
        )
      ).rows[0].count,
    );
    vi.stubEnv("OPENAI_API_KEY", "fixture-only-not-a-real-key");
    const { POST } =
      await import("../src/app/api/projects/[projectId]/conversations/[conversationId]/generate/route");
    const response = await POST(
      new Request(
        `http://localhost/api/projects/${projectId}/conversations/${conversationId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "Ignored replacement input",
            tool: "ask",
            subject: "Physics",
            retryOf: assistantId,
          }),
        },
      ),
      { params: Promise.resolve({ projectId, conversationId }) },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Fixture retry response.");
    const message = (
      await query("SELECT * FROM messages WHERE id=$1", [assistantId])
    ).rows[0];
    expect(message.status).toBe("completed");
    expect(message.content).toBe("Fixture retry response.");
    expect(
      Number(
        (
          await query(
            "SELECT count(*) FROM messages WHERE project_id=$1 AND role='user'",
            [projectId],
          )
        ).rows[0].count,
      ),
    ).toBe(userCount);
    const job = (await query("SELECT * FROM jobs WHERE id=$1", [generationId]))
      .rows[0];
    expect(job.payload.retryHistory[0].content).toBe(
      "Previously saved partial output.",
    );
    expect(job.payload.retryCount).toBe(1);
    vi.unstubAllEnvs();
  });
  it("retrieves scoped immutable source citations", async () => {
    const resource = await insertRow("resources", {
      id: id("resource"),
      projectId,
      title: "Source one",
      type: "document",
      content: "Momentum is conserved in an isolated system.",
    });
    await insertRow("resource_versions", {
      id: id("version"),
      projectId,
      resourceId: resource.id,
      version: 1,
      content: "Momentum is conserved in an isolated system.",
    });
    await insertRow("source_chunks", {
      id: id("chunk"),
      projectId,
      resourceId: resource.id,
      version: 1,
      section: 1,
      content: "Momentum is conserved in an isolated system.",
    });
    const passages = await searchSourcePassages(projectId, "momentum");
    expect(
      passages.some((p) => p.id === resource.id && p.url.includes("version=1")),
    ).toBe(true);
    expect(await searchSourcePassages(otherProjectId, "momentum")).toEqual([]);
  });
  it("marks stale generation partials interrupted when reopening the conversation", async () => {
    const partialId = id("partial"),
      jobId = id("stale-generation");
    await insertRow("messages", {
      id: partialId,
      projectId,
      conversationId,
      role: "assistant",
      content: "A durable partial explanation.",
      status: "generating",
    });
    await insertRow("jobs", {
      id: jobId,
      projectId,
      type: "generation",
      status: "processing",
      payload: { conversationId, assistantId: partialId },
      updatedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    });
    const conversation = await getEntity(
      "conversations",
      projectId,
      conversationId,
    );
    expect(
      conversation.messages.find((m: any) => m.id === partialId).status,
    ).toBe("interrupted");
    expect(
      conversation.messages.find((m: any) => m.id === partialId).content,
    ).toBe("A durable partial explanation.");
    expect(
      (await query("SELECT status FROM jobs WHERE id=$1", [jobId])).rows[0]
        .status,
    ).toBe("interrupted");
  });
});
describe("Responses streaming fixture adapter — no live provider", () => {
  it("passes validated function outputs into the next real-stream-shaped round", async () => {
    let round = 0;
    let text = "";
    const seen: any[] = [];
    const stream = async (input: any) => {
      seen.push(input.slice());
      const current = round++;
      return (async function* () {
        if (current === 0)
          yield {
            type: "response.completed",
            response: {
              output: [
                {
                  type: "function_call",
                  name: "read_progress",
                  call_id: "call-1",
                  arguments: "{}",
                },
              ],
              usage: { input_tokens: 10, output_tokens: 2 },
            },
          } as any;
        else {
          yield {
            type: "response.output_text.delta",
            delta: "Your recorded evidence.",
          } as any;
          yield {
            type: "response.completed",
            response: {
              output: [],
              usage: { input_tokens: 12, output_tokens: 4 },
            },
          } as any;
        }
      })();
    };
    const execute = vi.fn(async () => ({ attempts: 2, correct: 1 }));
    const result = await runTutorRounds({
      input: [{ role: "user", content: "How am I doing?" }],
      tools: aiToolDefinitions,
      signal: new AbortController().signal,
      stream,
      onDelta: (delta) => {
        text += delta;
      },
      execute,
    });
    expect(text).toBe("Your recorded evidence.");
    expect(execute).toHaveBeenCalledWith("read_progress", {}, "call-1");
    expect(
      seen[1].some(
        (i: any) =>
          i.type === "function_call_output" &&
          JSON.parse(i.output).attempts === 2,
      ),
    ).toBe(true);
    expect(result.usage).toHaveLength(2);
  });
  it("does not treat a truncated provider stream as a complete response", async () => {
    await expect(
      runTutorRounds({
        input: [],
        tools: [],
        signal: new AbortController().signal,
        stream: async () => ({
          async *[Symbol.asyncIterator]() {
            yield {
              type: "response.output_text.delta",
              delta: "Partial",
            } as any;
          },
        }),
        onDelta: () => {},
        execute: async () => ({}),
      }),
    ).rejects.toThrow("ended before completion");
  });
  it("reports completed-round usage even when a later provider round fails", async () => {
    let round = 0;
    const recorded: unknown[] = [];
    await expect(
      runTutorRounds({
        input: [],
        tools: aiToolDefinitions,
        signal: new AbortController().signal,
        onDelta: () => {},
        onUsage: (record) => {
          recorded.push(record);
        },
        execute: async () => ({ attempts: 1 }),
        stream: async () => {
          const current = round++;
          return {
            async *[Symbol.asyncIterator]() {
              if (current === 0)
                yield {
                  type: "response.completed",
                  response: {
                    output: [
                      {
                        type: "function_call",
                        name: "read_progress",
                        call_id: "usage-call",
                        arguments: "{}",
                      },
                    ],
                    usage: { input_tokens: 25, output_tokens: 5 },
                  },
                } as any;
              else throw new Error("Fixture provider timeout");
            },
          };
        },
      }),
    ).rejects.toThrow("Fixture provider timeout");
    expect(recorded).toEqual([{ input_tokens: 25, output_tokens: 5 }]);
  });
});
