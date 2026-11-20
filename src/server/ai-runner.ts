import type {
  FunctionTool,
  ResponseInput,
  ResponseOutputItem,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { ApiError } from "./db";
export type TutorStreamAdapter = (
  input: ResponseInput,
  tools: FunctionTool[],
  signal: AbortSignal,
) => Promise<AsyncIterable<ResponseStreamEvent>>;
export async function runTutorRounds(options: {
  input: ResponseInput;
  tools: FunctionTool[];
  signal: AbortSignal;
  stream: TutorStreamAdapter;
  onDelta: (text: string) => void | Promise<void>;
  onUsage?: (usage: unknown, round: number) => void | Promise<void>;
  execute: (name: string, args: unknown, callId: string) => Promise<any>;
  onSources?: (sources: any[]) => void | Promise<void>;
}) {
  const input: ResponseInput = [...options.input];
  const usage: unknown[] = [];
  let output = "";
  for (let round = 0; round < 3; round++) {
    if (options.signal.aborted)
      throw new DOMException("Generation cancelled", "AbortError");
    const stream = await options.stream(input, options.tools, options.signal);
    let completed = false;
    let resultItems: ResponseOutputItem[] = [];
    for await (const event of stream) {
      if (options.signal.aborted)
        throw new DOMException("Generation cancelled", "AbortError");
      if (event.type === "response.output_text.delta") {
        output += event.delta;
        await options.onDelta(event.delta);
      } else if (event.type === "response.completed") {
        completed = true;
        resultItems = event.response.output;
        usage.push(event.response.usage);
        await options.onUsage?.(event.response.usage, round + 1);
      } else if (event.type === "error" || event.type === "response.failed")
        throw new Error("The provider could not complete the response.");
      else if (event.type === "response.incomplete")
        throw new Error(
          "The response reached its configured output limit. Retry with a shorter request.",
        );
    }
    if (!completed)
      throw new Error("The provider stream ended before completion.");
    const calls = resultItems.filter((item) => item.type === "function_call");
    if (!calls.length) return { output, usage, rounds: round + 1 };
    if (round === 2)
      throw new Error(
        "The tutor reached its three-step tool limit. Continue with a follow-up question.",
      );
    input.push(...(resultItems as any));
    for (const call of calls) {
      if (options.signal.aborted)
        throw new DOMException("Generation cancelled", "AbortError");
      let result: any;
      try {
        if (!options.tools.some((t) => t.name === call.name))
          throw new ApiError(400, "Unregistered tool");
        const args = JSON.parse(call.arguments);
        result = await options.execute(call.name, args, call.call_id);
        if (Array.isArray(result.passages))
          await options.onSources?.(result.passages);
      } catch (error) {
        if (options.signal.aborted) throw error;
        result = {
          error:
            error instanceof Error
              ? error.message
              : "Tool arguments were not accepted",
          executed: false,
        };
      }
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
  }
  return { output, usage, rounds: 3 };
}
