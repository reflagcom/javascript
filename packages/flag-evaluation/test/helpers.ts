import { CompiledFlag, newEvaluator } from "../src";

/** Keep single-flag operator/allocation fixtures focused on their behavior. */
export function prepareFlag<T>(flag: CompiledFlag<T>) {
  const evaluator = newEvaluator({ flags: [flag] });
  return (context: Record<string, unknown>) =>
    evaluator.evaluateFlag(context, flag.key);
}
