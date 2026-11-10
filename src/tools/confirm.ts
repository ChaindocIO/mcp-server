import { z } from "zod";
import { ConfirmationRequiredError } from "../core/errors.js";

/**
 * Money acts (charge, mark paid, credit note) run only after the user said yes. The agent passes
 * `confirm: true` once the user has confirmed this exact action; without it the handler refuses before any
 * call is made.
 */
export const confirmField = z
  .boolean()
  .default(false)
  .describe(
    "Must be true. Set it only after the USER has explicitly confirmed this exact action in this conversation " +
      "(which invoice, which amount, who is affected). Never set it on your own.",
  );

export function requireConfirmation(confirm: boolean | undefined, action: string): void {
  if (confirm !== true) throw new ConfirmationRequiredError(action);
}
