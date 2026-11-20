import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { handleApi } from "../src/server/api";
import { identitySession, checkRequestOrigin } from "../src/server/identity";
import { query, pool, id } from "../src/server/db";
import { GET as getCurriculum } from "../src/app/api/projects/[projectId]/curriculum/route";

let a: { id: string; cookie: string }, b: { id: string; cookie: string };
let projectA: string, projectB: string;
const priorDemo = process.env.DEMO_MODE;
function request(path: string, method = "GET", cookie = "", payload?: unknown) {
  return new Request(`http://localhost:3000/api/${path}`, {
    method,
    headers: {
      Cookie: cookie,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}
async function call(
  path: string,
  method = "GET",
  cookie = "",
  payload?: unknown,
) {
  const result = await handleApi(
    request(path, method, cookie, payload),
    path.split("?")[0].split("/"),
  );
  return { status: result.status, body: await result.json() };
}
beforeAll(async () => {
  expect((await query("SELECT current_database() AS name")).rows[0].name).toBe(
    "ingenium_demo",
  );
  process.env.DEMO_MODE = "false";
  async function create() {
    const response = await identitySession(request("identity/session", "POST"));
    const { student } = await response.json();
    expect(response.status).toBe(201);
    return {
      id: student.id,
      cookie: response.headers.get("set-cookie")!.split(";")[0],
    };
  }
  a = await create();
  b = await create();
  projectA = (
    await call("projects", "POST", a.cookie, {
      name: "Student A isolation",
      exam: "Custom",
      subjects: ["History"],
    })
  ).body.item.id;
  projectB = (
    await call("projects", "POST", b.cookie, {
      name: "Student B isolation",
      exam: "Custom",
      subjects: ["Computing"],
    })
  ).body.item.id;
});
afterAll(async () => {
  for (const s of [a, b].filter(Boolean)) {
    await query("DELETE FROM projects WHERE student_id=$1", [s.id]);
    await query("DELETE FROM demo_students WHERE id=$1", [s.id]);
  }
  if (priorDemo === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = priorDemo;
  await pool.end();
});
describe("private browser workspaces", () => {
  it("uses durable opaque sessions and never trusts a user ID as credentials", async () => {
    const response = await identitySession(
      request("identity/session", "POST", a.cookie),
    );
    expect((await response.json()).student.id).toBe(a.id);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect((await call("projects")).status).toBe(401);
    expect(
      (await call("projects", "GET", `ingenium_workspace=${a.id}`)).status,
    ).toBe(401);
  });
  it("keeps simultaneous requests, preferences and project lists isolated", async () => {
    const [ra, rb] = await Promise.all([
      call("projects", "GET", a.cookie),
      call("projects", "GET", b.cookie),
    ]);
    expect(ra.body.projects.map((p: any) => p.id)).toEqual([projectA]);
    expect(rb.body.projects.map((p: any) => p.id)).toEqual([projectB]);
    await call("preferences", "PATCH", a.cookie, {
      name: "Alex",
      theme: "dark",
    });
    expect((await call("preferences", "GET", a.cookie)).body.name).toBe("Alex");
    expect((await call("preferences", "GET", b.cookie)).body.name).toBe(
      "Learner",
    );
    expect((await call(`projects/${projectA}`, "GET", b.cookie)).status).toBe(
      404,
    );
    const denied = await getCurriculum(
      request(`projects/${projectA}/curriculum`, "GET", b.cookie),
      { params: Promise.resolve({ projectId: projectA }) },
    );
    expect(denied.status).toBe(404);
  });
  it("scopes global search and notifications to the current student", async () => {
    await call(`projects/${projectA}/resources`, "POST", a.cookie, {
      title: "Private isolation token",
      type: "note",
      content: "Only Alex sees this.",
    });
    expect(
      (await call("search?q=Private%20isolation", "GET", b.cookie)).body.items,
    ).toEqual([]);
    expect(
      (await call("search?q=Private%20isolation", "GET", a.cookie)).body.items,
    ).toHaveLength(1);
    const notice = id("notice");
    await query(
      "INSERT INTO notifications(id,project_id,title) VALUES($1,$2,'Private notification')",
      [notice, projectA],
    );
    expect((await call("notifications", "GET", b.cookie)).body.items).toEqual(
      [],
    );
    expect(
      (await call(`notifications/${notice}`, "PATCH", b.cookie, { read: true }))
        .status,
    ).toBe(404);
    expect(
      (await call("notifications", "GET", a.cookie)).body.items[0].read,
    ).toBe(false);
  });
  it("rejects cross-site writes while accepting Next's local proxy host", () => {
    expect(() =>
      checkRequestOrigin(
        new Request("http://0.0.0.0:3000/api/identity/session", {
          method: "POST",
          headers: { host: "localhost:3000", origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      checkRequestOrigin(
        new Request("http://localhost:3000/api/projects", {
          method: "POST",
          headers: { host: "localhost:3000", origin: "https://other.example" },
        }),
      ),
    ).toThrow();
  });
  it("rejects expired sessions and preserves validation errors", async () => {
    expect(
      (await call("projects", "POST", a.cookie, { name: "" })).status,
    ).toBe(400);
    await query(
      "UPDATE student_sessions SET expires_at=now()-interval '1 second' WHERE student_id=$1",
      [b.id],
    );
    expect((await call("projects", "GET", b.cookie)).status).toBe(401);
  });
});
