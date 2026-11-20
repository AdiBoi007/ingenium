import { AsyncLocalStorage } from "node:async_hooks";

export type StudentIdentity = {
  id: string;
  name: string;
  demo: boolean;
  preferences: Record<string, unknown>;
};

export const studentContext = new AsyncLocalStorage<StudentIdentity>();
export const isLocalDemo = () =>
  process.env.DEMO_MODE === "true" && !process.env.VERCEL;
