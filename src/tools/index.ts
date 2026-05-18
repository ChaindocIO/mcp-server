import type { ToolDefinition } from "./types.js";
import { accountTools } from "./account.js";
import { mediaTools } from "./media.js";
import { documentsTools } from "./documents.js";
import { signaturesTools } from "./signatures.js";
import { embeddedTools } from "./embedded.js";
import { contractsTools } from "./contracts.js";
import { contractsTerminationTools } from "./contracts-termination.js";
import { contractsPaymentTermsTools } from "./contracts-payment-terms.js";
import { invoicesTools } from "./invoices.js";
import { transactionsTools } from "./transactions.js";
import { templatesTools } from "./templates.js";
import { webhooksTools } from "./webhooks.js";

export const allTools: ToolDefinition<unknown>[] = [
  ...accountTools,
  ...mediaTools,
  ...documentsTools,
  ...signaturesTools,
  ...embeddedTools,
  ...contractsTools,
  ...contractsTerminationTools,
  ...contractsPaymentTermsTools,
  ...invoicesTools,
  ...transactionsTools,
  ...templatesTools,
  ...webhooksTools,
];
