import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

/**
 * Conversions: a file becomes a text document asynchronously.
 *   GET /api/v1/documents/conversions/:conversionId
 */

const IdSchema = z.object({ conversionId: z.string().min(1) });

export const conversionsGet = defineTool({
  name: "chaindoc_conversions_get",
  description:
    "Where a file's conversion into a text document stands: 'converting', 'ready' (with documentId and versionId) or " +
    "'failed' (with failure.code). One read, no waiting; use chaindoc_conversions_wait to wait.",
  inputSchema: IdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_conversions_get", (sdk) => sdk.conversions.get(args.conversionId)),
});

export const conversionsWait = defineTool({
  name: "chaindoc_conversions_wait",
  description:
    "Wait (polling with backoff) until a conversion is ready, up to timeoutMs (default 60 s, max 120 s). " +
    "Returns { status: 'ready', documentId, versionId } when done. If the time runs out it returns " +
    "{ status: 'converting', timedOut: true } - the conversion may still finish: call this tool again with the same id. " +
    "A failed conversion is an error (errorKey DOCUMENT_CONVERSION_FAILED, with the failure code).",
  inputSchema: z.object({
    conversionId: z.string().min(1),
    timeoutMs: z.number().int().positive().max(120_000).default(60_000),
  }),
  handler: async (args, { client }) => {
    const timeoutMs = args.timeoutMs ?? 60_000;
    // The SDK throws ChaindocConversionTimeoutError after timeoutMs; that is a state to report, not a failure.
    // Reading the conversion once more tells us the real state instead of guessing it from the exception.
    try {
      const ready = await client.run("chaindoc_conversions_wait", (sdk) =>
        sdk.conversions.wait(args.conversionId, { timeoutMs }),
      );
      return { status: "ready" as const, conversion: ready, documentId: ready.documentId, versionId: ready.versionId };
    } catch (err) {
      if ((err as { name?: string }).name !== "ChaindocConversionTimeoutError") throw err;
      const { conversion } = await client.run("chaindoc_conversions_wait.read", (sdk) =>
        sdk.conversions.get(args.conversionId),
      );
      if (conversion.status !== "converting") {
        // It ended between the last poll and this read: one more wait returns the ready one or throws the failure.
        const ended = await client.run("chaindoc_conversions_wait.end", (sdk) =>
          sdk.conversions.wait(args.conversionId, { timeoutMs: 5_000 }),
        );
        return { status: "ready" as const, conversion: ended, documentId: ended.documentId, versionId: ended.versionId };
      }
      return {
        status: conversion.status,
        timedOut: true as const,
        conversion,
        hint: "Still converting. Call chaindoc_conversions_wait again with the same conversionId.",
      };
    }
  },
});

export const conversionsTools: ToolDefinition<unknown>[] = [
  conversionsGet as ToolDefinition<unknown>,
  conversionsWait as ToolDefinition<unknown>,
];
