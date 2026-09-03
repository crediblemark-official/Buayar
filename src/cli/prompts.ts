// Interactive prompts using @clack/prompts (arrow-key select).
// Non-interactive mode is handled in index.ts (skips these entirely).
import * as p from "@clack/prompts";

export interface Choice<T extends string> {
  value: T;
  label?: string;
  hint?: string;
}

export async function selectPrompt<T extends string>(
  message: string,
  choices: Choice<T>[],
  initialValue?: T
): Promise<T> {
  const result = await p.select({
    message,
    initialValue,
    options: choices.map((c) => {
      const opt: { value: T; label: string; hint?: string } = {
        value: c.value,
        label: c.label || c.value,
      };
      if (c.hint) opt.hint = c.hint;
      return opt as p.Option<T>;
    }),
  });

  if (p.isCancel(result)) {
    p.cancel("Dibatalkan oleh user.");
    process.exit(0);
  }
  return result as T;
}

export async function confirmPrompt(message: string, initialValue = true): Promise<boolean> {
  const result = await p.confirm({
    message,
    initialValue,
  });

  if (p.isCancel(result)) {
    p.cancel("Dibatalkan oleh user.");
    process.exit(0);
  }
  return result as boolean;
}
