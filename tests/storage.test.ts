import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  storeBytes,
  readBytes,
  removeBytes,
  storageKey,
} from "../src/server/storage";
describe("durable file storage", () => {
  it("rejects traversal and provider control characters", () => {
    for (const value of ["../secrets", "a/b", "s3:test", "foo.txt", ""])
      expect(() => storageKey(value)).toThrow();
  });
  it("roundtrips bytes and never silently overwrites an existing version", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ingenium-storage-"),
    );
    const prior = process.env.STORAGE_PATH,
      provider = process.env.STORAGE_PROVIDER;
    process.env.STORAGE_PATH = directory;
    process.env.STORAGE_PROVIDER = "local";
    try {
      const key = await storeBytes(
        "test-original",
        Buffer.from("an original note"),
        "text/plain",
      );
      expect((await readBytes(key)).toString()).toBe("an original note");
      await expect(
        storeBytes(key, Buffer.from("a replacement"), "text/plain"),
      ).rejects.toThrow();
      await removeBytes(key);
      await expect(readBytes(key)).rejects.toThrow();
    } finally {
      if (prior === undefined) delete process.env.STORAGE_PATH;
      else process.env.STORAGE_PATH = prior;
      if (provider === undefined) delete process.env.STORAGE_PROVIDER;
      else process.env.STORAGE_PROVIDER = provider;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
