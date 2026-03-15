import { WizardStepRegistry } from "../step-handler.js";
import { aia9Handler } from "./aia-9-risk-management.js";
import { aia10Handler } from "./aia-10-data-governance.js";
import { aia11Handler } from "./aia-11-technical-documentation.js";
import { aia12Handler } from "./aia-12-record-keeping.js";
import { aia13Handler } from "./aia-13-transparency.js";
import { aia14Handler } from "./aia-14-human-oversight.js";
import { aia15Handler } from "./aia-15-accuracy-robustness.js";
import { aia17Handler } from "./aia-17-quality-management.js";
import { aia26Handler } from "./aia-26-deployer-obligations.js";
import { aia47Handler } from "./aia-47-declaration-conformity.js";
import { aia60Handler } from "./aia-60-incident-reporting.js";
import { aia61Handler } from "./aia-61-post-market-monitoring.js";

export const euAiActRegistry = new WizardStepRegistry();

euAiActRegistry.register(aia9Handler);
euAiActRegistry.register(aia10Handler);
euAiActRegistry.register(aia11Handler);
euAiActRegistry.register(aia12Handler);
euAiActRegistry.register(aia13Handler);
euAiActRegistry.register(aia14Handler);
euAiActRegistry.register(aia15Handler);
euAiActRegistry.register(aia17Handler);
euAiActRegistry.register(aia26Handler);
euAiActRegistry.register(aia47Handler);
euAiActRegistry.register(aia60Handler);
euAiActRegistry.register(aia61Handler);
