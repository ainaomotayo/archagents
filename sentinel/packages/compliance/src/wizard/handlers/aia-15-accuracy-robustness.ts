import { createHandler } from "./_base.js";

export const aia15Handler = createHandler(
  "AIA-15",
  `## Accuracy, Robustness & Cybersecurity (Article 15)

Declare and measure accuracy levels using metrics appropriate for the system's intended purpose. Provide evidence of resilience testing against errors, faults, and adversarial attacks, along with documentation of cybersecurity measures protecting data and model integrity.`,
);
