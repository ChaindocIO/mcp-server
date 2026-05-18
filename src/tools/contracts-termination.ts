import { z } from "zod";
import { defineTool, type ToolDefinition } from "./types.js";

const IdSchema = z.object({ contractId: z.string().uuid() });

const ApproveSchema = z.object({
  contractId: z.string().uuid(),
  comment: z.string().min(1).max(2000).optional(),
});

const RejectSchema = z.object({
  contractId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

export const contractsTerminationGet = defineTool({
  name: "chaindoc_contracts_termination_get",
  description: "Get the current or most-recent termination request (or null if none).",
  inputSchema: IdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_termination_get", (sdk) =>
      sdk.contracts.termination.get(args.contractId),
    ),
});

export const contractsTerminationGetStatus = defineTool({
  name: "chaindoc_contracts_termination_get_status",
  description:
    "Termination status preview: outstanding invoices, upcoming payments, earliest effective date, canInitiateTermination.",
  inputSchema: IdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_termination_get_status", (sdk) =>
      sdk.contracts.termination.getStatus(args.contractId),
    ),
});

export const contractsTerminationGetHistory = defineTool({
  name: "chaindoc_contracts_termination_get_history",
  description: "Full termination-request history for a contract.",
  inputSchema: IdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_termination_get_history", (sdk) =>
      sdk.contracts.termination.getHistory(args.contractId),
    ),
});

export const contractsTerminationApprove = defineTool({
  name: "chaindoc_contracts_termination_approve",
  description:
    "Approve a pending mutual-approval termination request. " +
    "Preconditions: caller must be the counterparty, not the initiator. " +
    "Returns code='wrong_party' otherwise. Optional `comment` is recorded on the approval.",
  inputSchema: ApproveSchema,
  handler: (args, { client }) => {
    const payload = args.comment !== undefined ? { comment: args.comment } : undefined;
    return client.run("chaindoc_contracts_termination_approve", (sdk) =>
      sdk.contracts.termination.approve(args.contractId, payload),
    );
  },
});

export const contractsTerminationReject = defineTool({
  name: "chaindoc_contracts_termination_reject",
  description: "Reject a pending mutual-approval termination request with a required `reason`.",
  inputSchema: RejectSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_termination_reject", (sdk) =>
      sdk.contracts.termination.reject(args.contractId, { reason: args.reason }),
    ),
});

export const contractsTerminationCancel = defineTool({
  name: "chaindoc_contracts_termination_cancel",
  description: "Cancel a still-pending termination request. Only the initiator can do this.",
  inputSchema: IdSchema,
  handler: (args, { client }) =>
    client.run("chaindoc_contracts_termination_cancel", (sdk) =>
      sdk.contracts.termination.cancel(args.contractId),
    ),
});

export const contractsTerminationTools: ToolDefinition<unknown>[] = [
  contractsTerminationGet as ToolDefinition<unknown>,
  contractsTerminationGetStatus as ToolDefinition<unknown>,
  contractsTerminationGetHistory as ToolDefinition<unknown>,
  contractsTerminationApprove as ToolDefinition<unknown>,
  contractsTerminationReject as ToolDefinition<unknown>,
  contractsTerminationCancel as ToolDefinition<unknown>,
];
