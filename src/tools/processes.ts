import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";
import { UnavailableError } from "../core/errors.js";

/**
 * Processes (the successor of the removed approval workflows) as an agent uses them: discover what the key may
 * start, start a case, follow it, read what happened, and answer a "wait for a system" step.
 *
 *   GET  /api/v1/processes                                           discover
 *   GET  /api/v1/processes/:processKey/entries/:entryKey              the entry's exact input schema
 *   POST /api/v1/processes/:processKey/entries/:entryKey/cases        start
 *   GET  /api/v1/processes/cases/:caseUuid                            status
 *   GET  /api/v1/processes/cases/:caseUuid/events                     events
 *   POST /api/v1/processes/integrations/:integrationUuid/responses    respond (HMAC-signed)
 */

const SubjectSchema = z.object({
  fieldId: z.string().optional().describe("The entry field this reference fills (from requiredSubjects); omit for the entry's native subject."),
  objectKind: z.enum(["document", "contract", "amendment", "invoice", "incoming_bill"]),
  uuid: z.string().uuid().describe("The native object's uuid (never a case-subject uuid)."),
  versionUuid: z.string().uuid().nullable().optional(),
});

const DeadlineSchema = z.union([
  z.object({ form: z.literal("date"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ form: z.literal("datetime"), at: z.string().datetime({ offset: true }), zone: z.string().nullable().optional() }),
  z.object({ form: z.literal("duration"), days: z.number().int().positive() }),
]);

const EntryAddressSchema = z.object({
  processKey: z.string().min(1),
  entryKey: z.string().min(1),
});

const StartSchema = EntryAddressSchema.extend({
  externalId: z
    .string()
    .min(1)
    .max(255)
    .describe(
      "YOUR id for this case (1-255 chars), unique per entry. The same externalId with the same body is a safe retry " +
        "(answers the same case, replayed=true). A changed body under an old externalId is PROCESS_IDEMPOTENCY_MEANING_CHANGED.",
    ),
  expectedVersionUuid: z
    .string()
    .uuid()
    .describe("The `versionUuid` of the entry schema you read with chaindoc_processes_get_entry. Keep it unchanged on a retry."),
  input: z.record(z.unknown()).optional().describe("Values by the entry's input fields; only the fields the schema declares."),
  subjects: z.array(SubjectSchema).optional(),
  deadline: DeadlineSchema.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

const CaseSchema = z.object({ caseUuid: z.string().uuid() });

const EventsSchema = CaseSchema.extend({
  afterEventUuid: z.string().uuid().optional().describe("The `nextAfter` of the previous page."),
  limit: z.number().int().min(1).max(100).optional(),
});

const RespondSchema = z.object({
  integrationUuid: z.string().uuid(),
  attemptNumber: z.number().int().nonnegative().describe("`attemptNumber` from the request correlation."),
  deliveryUuid: z.string().uuid().describe("`deliveryUuid` of the request this answers."),
  stepUuid: z.string().uuid().describe("`stepUuid` from the request correlation."),
  resultCode: z.string().min(1).describe("One of the result codes approved for the operation."),
  sourceEventId: z.string().min(1).describe("The system's own event id; a repeat with the same meaning is a duplicate."),
});

export const processesList = defineTool({
  name: "chaindoc_processes_list",
  description:
    "Discover: the active processes this key is explicitly granted ({ processKey, name }). Being listed is not " +
    "permission to start. Next: chaindoc_processes_get_entry with a processKey and an entryKey (entry keys are stable " +
    "addresses your integration is configured with). Needs a plan with Processes (PROCESS_NOT_IN_PLAN).",
  inputSchema: z.object({}),
  handler: (_args, { client }) => client.run("chaindoc_processes_list", (sdk) => sdk.processes.list()),
});

export const processesGetEntry = defineTool({
  name: "chaindoc_processes_get_entry",
  description:
    "The exact current input schema of one entry: its kind, `versionUuid` (to pass as expectedVersionUuid), input fields " +
    "with their types and limits, required native subjects (documents, contracts, invoices...), materials. Read it " +
    "before every start and send only the fields it declares. Reading is not permission to start (PROCESS_LAUNCH_FORBIDDEN).",
  inputSchema: EntryAddressSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_processes_get_entry", (sdk) => sdk.processes.getEntry(args.processKey, args.entryKey)),
});

export const processesStart = defineTool({
  name: "chaindoc_processes_start",
  description:
    "Start a case on an entry the key may start. Sends `externalId` (your id, makes retries safe), the " +
    "`expectedVersionUuid` read from chaindoc_processes_get_entry, `input` for the declared fields, and `subjects` for " +
    "declared native references. Answers { caseUuid, lifecycle, replayed }. A case may email people and set work in motion: " +
    "confirm the values with the user first. On PROCESS_VERSION_MOVED re-read the entry and start again with a NEW " +
    "externalId; on PROCESS_INPUT_INVALID the details name the fields. Not retried automatically: after an uncertain " +
    "failure repeat the SAME call (same externalId and body) - it cannot start a second case.",
  inputSchema: StartSchema,
  handler: (args, { client }) => {
    const { processKey, entryKey, ...params } = args;
    return client.run("chaindoc_processes_start", (sdk) => sdk.processes.start(processKey, entryKey, params));
  },
});

export const processesGetCase = defineTool({
  name: "chaindoc_processes_get_case",
  description:
    "Status of a case: the receipt { caseUuid, status } for the key that started it, or, with a read grant, the full " +
    "header (process, startedAt, closedAt, deadlineAt, result, lifecycle, closeReason). status: running | completed | " +
    "rejected | cancelled | expired. Poll sparingly; chaindoc_processes_get_events says what happened.",
  inputSchema: CaseSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_processes_get_case", (sdk) => sdk.processes.getCase(args.caseUuid)),
});

export const processesGetEvents = defineTool({
  name: "chaindoc_processes_get_events",
  description:
    "One page of a case's history under the key's read grant: events { eventUuid, eventType, occurredAt, data } with " +
    "`hasMore` and `nextAfter`. Pass `nextAfter` as `afterEventUuid` for the next page (no automatic paging). " +
    "Events carry no actors or raw payloads.",
  inputSchema: EventsSchema,
  handler: (args, { client }) => {
    const { caseUuid, ...query } = args;
    return client.run("chaindoc_processes_get_events", (sdk) =>
      sdk.processes.getEvents(caseUuid, Object.keys(query).length > 0 ? query : undefined),
    );
  },
});

export const processesRespond = defineTool({
  name: "chaindoc_processes_respond",
  description:
    "Answer a 'Wait for a system' step as the connected system (the integration), with one of the result codes approved " +
    "for the operation. The request is signed with the integration's own secret, which the OPERATOR configures on this " +
    "server (CHAINDOC_PROCESS_INTEGRATION_SECRETS, local stdio only) - never pass or ask for a secret. Without a configured " +
    "secret this tool is unavailable. A repeat of the same reply returns duplicate=true. It moves the case on: only answer " +
    "for a system the user says you act as, with a code they chose.",
  inputSchema: RespondSchema,
  handler: async (args, { client, integrationSecrets }) => {
    const secret = integrationSecrets?.[args.integrationUuid];
    if (secret === undefined) {
      throw new UnavailableError(
        `No secret is configured for integration ${args.integrationUuid}.`,
        "The operator must set CHAINDOC_PROCESS_INTEGRATION_SECRETS for the local stdio server. The hosted server cannot answer for an integration.",
      );
    }
    const { integrationUuid, ...params } = args;
    return client.run("chaindoc_processes_respond", (sdk) =>
      sdk.processes.respond(integrationUuid, params, secret),
    );
  },
});

export const processesTools: ToolDefinition<unknown>[] = [
  processesList as ToolDefinition<unknown>,
  processesGetEntry as ToolDefinition<unknown>,
  processesStart as ToolDefinition<unknown>,
  processesGetCase as ToolDefinition<unknown>,
  processesGetEvents as ToolDefinition<unknown>,
  processesRespond as ToolDefinition<unknown>,
];
