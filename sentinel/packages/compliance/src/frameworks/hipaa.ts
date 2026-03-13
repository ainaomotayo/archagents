import type { FrameworkDefinition } from "../types.js";

/**
 * HIPAA Security Rule (45 CFR Part 160 and Subparts A and C of Part 164)
 *
 * Three safeguard categories:
 *   AS- = Administrative Safeguards (§164.308)
 *   PS- = Physical Safeguards (§164.310)
 *   TS- = Technical Safeguards (§164.312)
 *
 * regulatoryStatus:
 *   "required"     – (R) Must be implemented
 *   "addressable"  – (A) Must assess; implement or document alternative
 *
 * Required controls carry weight >= 2.0; addressable controls carry 1.5.
 */
export const HIPAA: FrameworkDefinition = {
  slug: "hipaa",
  name: "HIPAA Security Rule",
  version: "2013",
  category: "regulatory",
  controls: [
    // ===================================================================
    // ADMINISTRATIVE SAFEGUARDS (AS) — §164.308
    // ===================================================================

    // --- AS-1  Security Management Process (R) §164.308(a)(1) ---
    { code: "AS-1", name: "Security Management Process", weight: 3.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-1.1", name: "Risk Analysis", weight: 3.0, matchRules: [{ severity: ["critical", "high", "medium"] }], requirementType: "hybrid", regulatoryStatus: "required", parentCode: "AS-1", description: "Conduct accurate and thorough assessment of potential risks and vulnerabilities to ePHI." },
    { code: "AS-1.2", name: "Risk Management", weight: 3.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-1", description: "Implement security measures to reduce risks and vulnerabilities to a reasonable level." },
    { code: "AS-1.3", name: "Sanction Policy", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-1", description: "Apply appropriate sanctions against workforce members who fail to comply with policies." },
    { code: "AS-1.4", name: "Information System Activity Review", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/audit-logging*" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "AS-1", description: "Implement procedures to regularly review records of information system activity." },

    // --- AS-2  Assigned Security Responsibility (R) §164.308(a)(2) ---
    { code: "AS-2", name: "Assigned Security Responsibility", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-2.1", name: "Assigned Security Official", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-2", description: "Identify a security official responsible for developing and implementing security policies." },

    // --- AS-3  Workforce Security (R) §164.308(a)(3) ---
    { code: "AS-3", name: "Workforce Security", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-3.1", name: "Authorization and/or Supervision", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "AS-3", description: "Implement procedures for the authorization and/or supervision of workforce members." },
    { code: "AS-3.2", name: "Workforce Clearance Procedure", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "AS-3", description: "Implement procedures to determine workforce member access to ePHI is appropriate." },
    { code: "AS-3.3", name: "Termination Procedures", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "AS-3", description: "Implement procedures for terminating access to ePHI when employment ends." },
    { code: "AS-3.4", name: "Access Documentation", weight: 1.5, matchRules: [{ agent: "quality", category: "quality/documentation*" }], requirementType: "hybrid", regulatoryStatus: "addressable", parentCode: "AS-3", description: "Document access authorization policies and role-based access controls." },

    // --- AS-4  Information Access Management (R) §164.308(a)(4) ---
    { code: "AS-4", name: "Information Access Management", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-4.1", name: "Isolating Healthcare Clearinghouse Functions", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-4", description: "If a clearinghouse is part of a larger organization, protect ePHI from unauthorized access." },
    { code: "AS-4.2", name: "Access Authorization", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "AS-4", description: "Implement policies and procedures for granting access to ePHI." },
    { code: "AS-4.3", name: "Access Establishment and Modification", weight: 1.5, matchRules: [{ agent: "security", category: "vulnerability/access-control*" }], requirementType: "hybrid", regulatoryStatus: "addressable", parentCode: "AS-4", description: "Establish, document, review, and modify user access rights." },

    // --- AS-5  Security Awareness and Training (R) §164.308(a)(5) ---
    { code: "AS-5", name: "Security Awareness and Training", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-5.1", name: "Security Reminders", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "AS-5", description: "Periodic security updates and reminders for workforce members." },
    { code: "AS-5.2", name: "Protection from Malicious Software", weight: 1.5, matchRules: [{ agent: "security", category: "vulnerability/malware*" }], requirementType: "hybrid", regulatoryStatus: "addressable", parentCode: "AS-5", description: "Procedures for guarding against, detecting, and reporting malicious software." },
    { code: "AS-5.3", name: "Log-in Monitoring", weight: 1.5, matchRules: [{ agent: "security", category: "vulnerability/auth*" }], requirementType: "automated", regulatoryStatus: "addressable", parentCode: "AS-5", description: "Procedures for monitoring log-in attempts and reporting discrepancies." },
    { code: "AS-5.4", name: "Password Management", weight: 1.5, matchRules: [{ agent: "security", category: "vulnerability/credential*" }], requirementType: "hybrid", regulatoryStatus: "addressable", parentCode: "AS-5", description: "Procedures for creating, changing, and safeguarding passwords." },

    // --- AS-6  Security Incident Procedures (R) §164.308(a)(6) ---
    { code: "AS-6", name: "Security Incident Procedures", weight: 3.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-6.1", name: "Response and Reporting", weight: 3.0, matchRules: [{ severity: ["critical", "high"] }], requirementType: "hybrid", regulatoryStatus: "required", parentCode: "AS-6", description: "Identify and respond to suspected or known security incidents; mitigate and document." },

    // --- AS-7  Contingency Plan (R) §164.308(a)(7) ---
    { code: "AS-7", name: "Contingency Plan", weight: 3.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-7.1", name: "Data Backup Plan", weight: 3.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-7", description: "Establish and implement procedures to create and maintain retrievable exact copies of ePHI." },
    { code: "AS-7.2", name: "Disaster Recovery Plan", weight: 3.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-7", description: "Establish and implement procedures to restore any loss of data." },
    { code: "AS-7.3", name: "Emergency Mode Operation Plan", weight: 3.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-7", description: "Establish procedures to enable continuation of critical business processes for ePHI protection." },
    { code: "AS-7.4", name: "Testing and Revision Procedures", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "AS-7", description: "Implement procedures for periodic testing and revision of contingency plans." },
    { code: "AS-7.5", name: "Applications and Data Criticality Analysis", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "AS-7", description: "Assess the relative criticality of specific applications and data in support of contingency plans." },

    // --- AS-8  Evaluation (R) §164.308(a)(8) ---
    { code: "AS-8", name: "Evaluation", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-8.1", name: "Periodic Technical and Nontechnical Evaluation", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-8", description: "Perform periodic technical and nontechnical evaluation of security policies and procedures." },

    // --- AS-9  Business Associate Contracts (R) §164.308(b)(1) ---
    { code: "AS-9", name: "Business Associate Contracts and Other Arrangements", weight: 3.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-9.1", name: "Written Contract or Other Arrangement", weight: 3.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-9", description: "Document satisfactory assurances through written contract that BA will safeguard ePHI." },
    { code: "AS-9.2", name: "BAA Inventory and Tracking", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-9", description: "Maintain a complete inventory of all business associate agreements and their renewal dates." },
    { code: "AS-9.3", name: "BAA Compliance Verification", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-9", description: "Periodically verify that business associates comply with the terms of their agreements." },

    // --- AS-10  Policies and Procedures Documentation (R) §164.316(a) ---
    { code: "AS-10", name: "Policies and Procedures Documentation", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-10.1", name: "Implement Reasonable and Appropriate Policies", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-10", description: "Implement reasonable and appropriate policies and procedures to comply with the Security Rule." },
    { code: "AS-10.2", name: "Policy Maintenance and Updates", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-10", description: "Maintain policies and update as needed in response to environmental or operational changes." },

    // --- AS-11  Documentation Requirements (R) §164.316(b)(1) ---
    { code: "AS-11", name: "Documentation Requirements", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS" },
    { code: "AS-11.1", name: "Time Limit on Documentation Retention", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-11", description: "Retain documentation for 6 years from date of creation or last effective date." },
    { code: "AS-11.2", name: "Availability of Documentation", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "AS-11", description: "Make documentation available to persons responsible for implementing procedures." },
    { code: "AS-11.3", name: "Updates to Documentation", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/documentation*" }], requirementType: "hybrid", regulatoryStatus: "required", parentCode: "AS-11", description: "Review documentation periodically and update as needed in response to changes." },

    // ===================================================================
    // PHYSICAL SAFEGUARDS (PS) — §164.310
    // All Physical Safeguard controls are requirementType: "attestation"
    // ===================================================================

    // --- PS-1  Facility Access Controls (A) §164.310(a)(1) ---
    { code: "PS-1", name: "Facility Access Controls", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "PS" },
    { code: "PS-1.1", name: "Contingency Operations", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "PS-1", description: "Establish procedures that allow facility access in support of restoration of lost data." },
    { code: "PS-1.2", name: "Facility Security Plan", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "PS-1", description: "Implement policies and procedures to safeguard the facility and equipment from unauthorized access." },
    { code: "PS-1.3", name: "Access Control and Validation Procedures", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "PS-1", description: "Implement procedures to control and validate person's access to facilities based on role." },
    { code: "PS-1.4", name: "Maintenance Records", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "PS-1", description: "Implement policies and procedures to document repairs and modifications to the physical facility." },

    // --- PS-2  Workstation Use (R) §164.310(b) ---
    { code: "PS-2", name: "Workstation Use", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "PS" },
    { code: "PS-2.1", name: "Workstation Use Policies", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "PS-2", description: "Implement policies and procedures that specify proper functions, manner, and physical attributes of workstations." },

    // --- PS-3  Workstation Security (R) §164.310(c) ---
    { code: "PS-3", name: "Workstation Security", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "PS" },
    { code: "PS-3.1", name: "Physical Safeguards for Workstations", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "PS-3", description: "Implement physical safeguards for all workstations that access ePHI to restrict access to authorized users." },

    // --- PS-4  Device and Media Controls (R) §164.310(d)(1) ---
    { code: "PS-4", name: "Device and Media Controls", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "PS" },
    { code: "PS-4.1", name: "Disposal", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "PS-4", description: "Implement policies and procedures to address final disposition of ePHI and hardware/media." },
    { code: "PS-4.2", name: "Media Re-use", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "PS-4", description: "Implement procedures for removal of ePHI from electronic media before re-use." },
    { code: "PS-4.3", name: "Accountability", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "PS-4", description: "Maintain record of movements of hardware and electronic media and responsible persons." },
    { code: "PS-4.4", name: "Data Backup and Storage", weight: 1.5, matchRules: [], requirementType: "attestation", regulatoryStatus: "addressable", parentCode: "PS-4", description: "Create retrievable exact copy of ePHI before movement of equipment." },

    // ===================================================================
    // TECHNICAL SAFEGUARDS (TS) — §164.312
    // ===================================================================

    // --- TS-1  Access Control (R) §164.312(a)(1) ---
    { code: "TS-1", name: "Access Control", weight: 3.0, matchRules: [{ agent: "security" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS" },
    { code: "TS-1.1", name: "Unique User Identification", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/auth*" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS-1", description: "Assign a unique name and/or number for identifying and tracking user identity." },
    { code: "TS-1.2", name: "Emergency Access Procedure", weight: 2.0, matchRules: [], requirementType: "attestation", regulatoryStatus: "required", parentCode: "TS-1", description: "Establish procedures for obtaining necessary ePHI during an emergency." },
    { code: "TS-1.3", name: "Automatic Logoff", weight: 1.5, matchRules: [{ agent: "security", category: "vulnerability/session*" }], requirementType: "automated", regulatoryStatus: "addressable", parentCode: "TS-1", description: "Implement electronic procedures that terminate an electronic session after a predetermined time of inactivity." },
    { code: "TS-1.4", name: "Encryption and Decryption", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/encryption*" }], requirementType: "automated", regulatoryStatus: "addressable", parentCode: "TS-1", description: "Implement mechanism to encrypt and decrypt ePHI." },

    // --- TS-2  Audit Controls (R) §164.312(b) ---
    { code: "TS-2", name: "Audit Controls", weight: 3.0, matchRules: [{ agent: "security" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS" },
    { code: "TS-2.1", name: "Audit Logging and Monitoring", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/audit-logging*" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS-2", description: "Implement hardware, software, and/or procedural mechanisms to record and examine activity in systems containing ePHI." },

    // --- TS-3  Integrity (R) §164.312(c)(1) ---
    { code: "TS-3", name: "Integrity", weight: 3.0, matchRules: [{ agent: "security" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS" },
    { code: "TS-3.1", name: "Mechanism to Authenticate Electronic PHI", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/data-integrity*" }], requirementType: "automated", regulatoryStatus: "addressable", parentCode: "TS-3", description: "Implement electronic mechanisms to corroborate that ePHI has not been altered or destroyed." },

    // --- TS-4  Person or Entity Authentication (R) §164.312(d) ---
    { code: "TS-4", name: "Person or Entity Authentication", weight: 3.0, matchRules: [{ agent: "security" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS" },
    { code: "TS-4.1", name: "Authentication Mechanisms", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/auth*" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS-4", description: "Implement procedures to verify that a person or entity seeking access to ePHI is the one claimed." },

    // --- TS-5  Transmission Security (R) §164.312(e)(1) ---
    { code: "TS-5", name: "Transmission Security", weight: 3.0, matchRules: [{ agent: "security" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS" },
    { code: "TS-5.1", name: "Integrity Controls", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/transport*" }], requirementType: "automated", regulatoryStatus: "addressable", parentCode: "TS-5", description: "Implement security measures to ensure electronically transmitted ePHI is not improperly modified." },
    { code: "TS-5.2", name: "Encryption", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/encryption*" }], requirementType: "automated", regulatoryStatus: "addressable", parentCode: "TS-5", description: "Implement mechanism to encrypt ePHI whenever deemed appropriate during transmission." },

    // --- TS-6  Additional Technical Controls ---
    { code: "TS-6", name: "Encryption Key Management", weight: 3.0, matchRules: [{ agent: "security" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS" },
    { code: "TS-6.1", name: "Key Generation and Distribution", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/crypto*" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS-6", description: "Implement secure processes for generating, distributing, and storing encryption keys." },
    { code: "TS-6.2", name: "Key Rotation Procedures", weight: 2.0, matchRules: [{ agent: "security", category: "vulnerability/crypto*" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS-6", description: "Establish and implement key rotation schedules and procedures." },

    // --- TS-7  Network Security Controls ---
    { code: "TS-7", name: "Network Security", weight: 3.0, matchRules: [{ agent: "security" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS" },
    { code: "TS-7.1", name: "Network Segmentation", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/network*" }], requirementType: "automated", regulatoryStatus: "required", parentCode: "TS-7", description: "Implement network segmentation to isolate systems containing ePHI from general-purpose networks." },
  ],
};
