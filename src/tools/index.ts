import type { ToolDefinition } from "./types.js";
import { accountTools } from "./account.js";
import { mediaTools } from "./media.js";
import { documentsTools } from "./documents.js";
import { signaturesTools } from "./signatures.js";
import { embeddedTools } from "./embedded.js";
import { contractsTools } from "./contracts.js";
import { contractsTerminationTools } from "./contracts-termination.js";
import { contractsPaymentTermsTools } from "./contracts-payment-terms.js";
import { contractsAgreementsTools } from "./contracts-agreements.js";
import { invoicesTools } from "./invoices.js";
import { transactionsTools } from "./transactions.js";
import { templatesTools } from "./templates.js";
import { webhooksTools } from "./webhooks.js";
import { conversionsTools } from "./conversions.js";
import { financeTools } from "./finance.js";
import { processesTools } from "./processes.js";

export const allTools: ToolDefinition<unknown>[] = [
  ...accountTools,
  ...mediaTools,
  ...documentsTools,
  ...conversionsTools,
  ...signaturesTools,
  ...embeddedTools,
  ...contractsTools,
  ...contractsTerminationTools,
  ...contractsPaymentTermsTools,
  ...contractsAgreementsTools,
  ...invoicesTools,
  ...transactionsTools,
  ...financeTools,
  ...processesTools,
  ...templatesTools,
  ...webhooksTools,
];
