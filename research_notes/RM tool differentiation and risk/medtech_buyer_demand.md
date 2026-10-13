# Medtech buyer demand: what small medical device teams use and want for requirements management, and where self-hosting demand really is

Researcher's note on evidence quality (read first):

- Almost everything findable on this topic is vendor marketing or vendor-commissioned research. Independent survey data on tool choice by company size, or on cloud versus self-hosted preference, was **not found**.
- Three planned primary sources could not be read this session: the FDA CSA final guidance PDF (downloaded, but no PDF text tool was available), the OpenRegulatory articles (HTTP 403), and Reddit / Hacker News threads (searches returned none). Points that rest on search-result summaries rather than the page itself are marked "(snippet only)".
- Statements labelled "background knowledge" come from the researcher's training, not a source fetched this session. Verify before publishing.

## 1. What tools do small medtech teams use today for requirements, DHF and traceability?

### Takeaway
The "mostly Word and Excel" assumption is directionally supported, but only by vendor-sponsored surveys with no published breakdown by company size. The realistic competitor set for a small team is Word/Excel, Jira/Confluence (with or without an overlay such as Ketryx), and medtech-specific cloud tools (Greenlight Guru, Matrix Req, Qualio, Formwork), not Jama or Polarion.

### Cited Findings
- Axendia (research commissioned by Jama Software, 2022) surveyed 96 medical device professionals; 87% of executives said their requirements management process was "not effective or somewhat effective"; the report says the industry still relies heavily on static Word and Excel documents. Most responding companies had under $50M revenue. No Excel/Word percentage by company size is given in the public summary. (snippet only) — [Axendia](https://axendia.com/blog/2022/01/31/new-market-research-the-costly-impact-of-ineffective-requirements-management-in-the-medical-device-industry/); [Jama webinar page](https://www.jamasoftware.com/webinar/the-costly-impact-of-ineffective-requirements-management-in-the-medical-device-industry/)
- Perforce "State of Medical Device Development" survey (2018): only 46% of respondents were confident they could pass an FDA audit; many still used Word and Excel to document development. Old, and vendor-run. (snippet only) — [Becker's Spine](https://www.beckersspine.com/?p=36615)
- Greenlight Guru's 2025 benchmark material gives no figure for paper/Excel use in design controls; the only number surfaced was that 34% of post-market teams found critical process gaps during audits. Its customer stories describe pre-purchase states such as "paper via SharePoint folders". (snippet only, vendor marketing) — [Greenlight Guru 2025 QMS page](https://www.greenlight.guru/2025-qms-software)
- Ketryx positions itself as a compliance layer over tools teams already use: "Create your requirements in Jira or the tool of your choice". This is direct evidence that Jira is a common home for requirements in software-heavy medtech. (vendor claim) — [Ketryx requirements management](https://www.ketryx.com/capabilities/requirements-management)
- An Atlassian community post (written by OpenRegulatory, which sells the Formwork eQMS) says startups increasingly avoid Greenlight Guru and Qualio because of opaque pricing and year-long lock-in, and prefer tools with a free tier, unlimited users and monthly cancellation. (snippet only, partisan) — [Atlassian community](https://community.atlassian.com/forums/App-Central-discussions/How-To-Set-Up-a-Jira-Confluence-QMS-For-Medical-Device/m-p/2953280)
- OpenRegulatory's QMS software comparison describes the open-source tool Doorstop as providing only requirements management features, "so it's not really QMS software in the strict sense", and criticises Jira/Confluence for needing extra plugins for signing and risk management. (snippet only) — [OpenRegulatory comparison](https://openregulatory.com/articles/qms-software-iso-13485-comparison)
- Docs-as-code exists as a real pattern: guides describe companies keeping the whole QMS as Markdown in Git with pull-request approvals, with the caveat that a Git commit or PR approval "may not fully meet Part 11 signature requirements without additional controls". (snippet only, secondary blog) — [IntuitionLabs](https://intuitionlabs.ai/articles/git-workflows-fda-compliance)
- Open-source projects in this space exist but are small: UCL's QW (traceability matrices from GitHub/GitLab, early release), OpenQMS (GitHub-native QMS generator), and a curated "Awesome Medical Device QMS" list. — [UCL-ARC/qw](https://github.com/UCL-ARC/qw); [OpenQMS](https://iridiumsoftware.github.io/OpenQMS/regulatory/medical-devices/); [Awesome list](https://github.com/alianov/Awesome-Medical-Device-QMS)
- Consultancy Innolitics runs client projects on its own proprietary "Medtech OS" and delivers Word documents "that can be stored in any QMS". This shows Word remains the lowest-common-denominator deliverable format even for a software-savvy SaMD consultancy. (snippet only) — [Innolitics](https://innolitics.com/services/)

### Inferences
- Assumption (a) is plausible but unquantified for the 5-100 person segment. The only numbers come from Jama- and Perforce-sponsored surveys whose purpose is to sell RM tools.
- For SaMD startups specifically, "Jira plus documents" is at least as likely a starting point as pure Word/Excel. An RM-only tool competes with "stay in Jira and add an overlay", which requires no migration.
- The existence of several tiny open-source medtech QMS/traceability projects with little visible adoption is weak evidence that open source alone is not a pull factor in this market.

### Gaps
- No independent survey with tool share by company size was found.
- Reddit (r/MedicalDevices, r/regulatoryaffairs), Hacker News and LinkedIn practitioner accounts were searched for but not retrieved. This is the biggest hole: first-hand buyer voice is missing from these notes.
- Greenlight Guru's full annual industry report and the full Axendia report are gated and were not read.

## 2. Do small medtech companies prefer cloud SaaS or self-hosted? Who decides?

### Takeaway
No direct preference data exists, but supply-side evidence points firmly to cloud: every medtech-specific tool aimed at small companies is cloud-first or cloud-only, and they sell "no IT required" as a benefit. This contradicts assumption (b) for the small-medtech segment.

### Cited Findings
- Matrix One (Matrix Req, Matrix Quality): cloud hosting is included in the subscription; the pricing page does not mention an on-premises option. A third-party review of Matrix Quality states it is "cloud-only; no on-premises option". — [Matrix One pricing](https://matrixone.health/pricing); [SoftwareConnect review](https://softwareconnect.com/reviews/matrix-quality/) (snippet only)
- Greenlight Guru is AWS-hosted with a validation package included and mandatory one-time onboarding. (snippet only) — [rfp.wiki](https://www.rfp.wiki/specialty-industries/manufacturing/quality-management-system-software/greenlight-guru/zenqms)
- A 2026 eQMS buyer's guide recommends Greenlight Guru for medical device startups of 1-50 employees, citing "rapid cloud deployment with no IT infrastructure required". (snippet only, single review site) — [MedDeviceGuide](https://meddeviceguide.com/blog/best-eqms-software-medical-devices-2026-guide)
- Vendor content describes the market direction as moving from legacy on-premises QMS to SaaS eQMS, citing manual updates and "heavy IT support burden" on-premises, and vendor validation support as reducing the internal compliance burden. (vendor advocacy) — [Xtalks webinar](https://xtalks.com/webinars/successfully-moving-from-on-premises-qms-to-saas-eqms/); [Qualio](https://qualio.com/resources/cloud-vs-on-premise-qms-software-which-should-i-choose)
- Counterpoint: an MD+DI article reports that some manufacturers equate cloud with "a lack of control and security that is intolerable" for a regulated device maker; the article then argues for cloud anyway. Undated in results, and concerns larger manufacturers with ERP. (snippet only) — [MD+DI](https://www.mddionline.com/testing/integrating-erp-and-quality-management-in-the-cloud)
- Even Jama, which still sells self-hosted, "recommends its cloud-hosted options for most organizations" and states that its support team does not perform maintenance, patching or upgrades for self-hosted customers. It publishes a self-hosted-to-cloud migration guide (updated January 2025). (snippet only) — [Jama self-hosted scope of support](https://support.jamasoftware.com/hc/en-us/articles/24072328211085-Jama-Connect-Self-Hosted-Scope-of-Support); [Jama migration guide](https://support.jamasoftware.com/hc/en-us/articles/23457993454477-Self-Hosted-to-Cloud-Deployment-Migration)

### Inferences
- If small medtech wanted self-hosting, at least one of the vendors that target it would offer it. None found does. The vendors that do offer on-premises (Jama, Polarion, Codebeamer, Helix ALM, Visure) are the enterprise tools sold into aerospace, defence and automotive.
- Self-hosting moves validation, backup, patching and security evidence onto a company that typically has no IT function. For a QA/RA lead, that is extra audit surface, not a benefit.
- Self-hosting is more likely to matter in medtech as a secondary benefit (no lock-in, data export, survives vendor failure, price) than as a primary buying reason. The OpenRegulatory complaints about lock-in and missing structured export suggest "you can always get your data out" is the resonant message, not "run it yourself".

### Gaps
- No source found on who signs off the purchase (QA/RA lead versus engineering versus founder). Background knowledge, unverified: in sub-50-person device companies the QA/RA lead or a founder usually owns QMS tooling, with engineering influencing RM tools in SaMD firms.
- No evidence found of EU medtech buyers demanding self-hosting for data-sovereignty reasons; equally no evidence against. EU-region cloud hosting may satisfy most of that concern.
- Larger hospital-affiliated or public-sector device developers (e.g. university or NHS in-house manufacturing) may differ; not researched. UCL's in-house QW tool hints at this niche.

## 3. Where is self-hosting / air-gapped / on-premises demand genuinely strong?

### Takeaway
Demand for self-hosted and air-gapped RM is explicit and regulation-driven in aerospace and defence; vendors name that sector, not medtech, when they justify keeping an on-premises product. The comparison is unfavourable to a medtech-first, self-hosted-first positioning.

### Cited Findings
- Jama's deployment page says self-hosting suits "industries requiring strict data sovereignty, air-gapped environments, or regulatory compliance", and that air-gapped operation is "ideal for sectors like aerospace and defense that mandate offline solutions". Its 9.28.x install guide includes airgap steps. (snippet only) — [Jama deployment options](https://www.jamasoftware.com/deployment-options/)
- ITAR is described as requiring technical data on defence articles to stay within national boundaries under strict access controls, which is given as the main driver for on-premises or disconnected deployment. (vendor blog, snippet only) — [ONES.com](https://ones.com/blog/best-on-premises-defense-requirements-tools-for-2026/)
- Buyer checklists for defence RM tools include fully offline operation including licence activation, feature parity between self-hosted and SaaS, audit logs and role-based access aligned with NIST 800-171, and vendor security documentation. (vendor blog, snippet only) — [ONES.com](https://ones.com/blog/best-on-premises-defense-requirements-tools-for-2026/)
- CMMC: the 32 CFR program rule was published 15 October 2024 and took effect 16 December 2024; the DFARS acquisition rule began putting CMMC requirements into contracts from 10 November 2025 (one source says September 2025; sources disagree). Any cloud service provider handling CUI must meet FedRAMP Moderate or equivalent. (snippet only) — [Polsinelli](https://www.polsinelli.com/publications/dod-publishes-final-rule-to-establish-its-cmmc-program); [VC3](https://www.vc3.com/blog/cmmc-final-rule-signals-compliance-ramp-up?hsLang=en); [Deltek](https://www.deltek.com/resources/articles/fedramp-impacts-cmmc/)
- An unverified vendor-blog claim says that on 13 July 2026 the DoD suspended mandatory third-party C3PAO certification for Level 2 pending a 60-day review. Not confirmed from an official source; do not rely on it. — [Hyperproof](https://hyperproof.io/get-cmmc-ready/)
- Tools listed as offering on-premises: IBM DOORS / DOORS Next, Jama Connect, Polarion, Codebeamer, Helix ALM, Visure, GForge (markets itself as air-gapped capable). (vendor blogs, snippet only) — [ONES.com](https://ones.com/blog/best-on-premises-defense-requirements-tools-for-2026/); [GForge](https://gforge.com/defense-aerospace/)

### Inferences
- The FedRAMP Moderate requirement for any cloud provider touching CUI is a hard barrier for small SaaS vendors and a structural reason for defence suppliers to self-host. Medtech has no equivalent rule: nothing in FDA or MDR rules forbids cloud hosting.
- A small defence subcontractor facing CMMC Level 2 has a compliance reason to prefer a self-hosted tool; a small medtech has a compliance reason (supplier validation evidence, no IT) to prefer a vendor-hosted one. The founder's self-hosting advantage is aligned with defence buyers and misaligned with medtech buyers.
- Caveat for the defence route: those buyers ask for vendor security documentation and offline licensing, and sales cycles and procurement vetting are heavy for a solo founder. An AGPL licence may also face legal review in defence primes. (Opinion, not sourced.)

### Gaps
- Automotive (ISO 26262, ASPICE, TISAX), European public sector and data-sovereignty buyers were not researched in the tool-call budget. No evidence either way.
- No market sizing found for small defence suppliers needing an RM tool.
- CMMC dates and the 2026 suspension claim need checking against the Federal Register.

## 4. Computerised system validation: what must a company adopting an RM tool do, and how do validation packs work?

### Takeaway
The obligation to validate sits with the device manufacturer, for its intended use, scaled to risk; a vendor pack only supplies evidence the customer can lean on. Medtech cloud vendors now bundle a validation pack at no separate charge, so "paid validation pack" is weaker as a revenue line than assumed, and a self-hosted open-source tool leaves more of the work with the user.

### Cited Findings
- FDA issued the final Computer Software Assurance guidance on 23 or 24 September 2025 (sources differ by a day), after a September 2022 draft; an updated version aligned with the QMSR was issued 3 February 2026. (snippet only) — [NSF](https://www.nsf.org/life-science-regulatory-news/fda-final-guidance-computer-software-assurance-csa); [RQA](https://www.therqa.com/news/fda-issues-final-guidance-computer-software-assura/); [FDA guidance PDF, not text-read](https://www.fda.gov/media/188844/download)
- Scope: computers and automated data processing systems used in production or the quality system. It endorses a risk-based approach keyed to the intended use of each feature or function, with more rigour where failure could foreseeably compromise safety or quality. It supplements the 2002 General Principles of Software Validation and supersedes its Section 6. It excludes software that is itself a device. (snippet only) — [NSF](https://www.nsf.org/life-science-regulatory-news/fda-final-guidance-computer-software-assurance-csa); [Hogan Lovells](https://biopreviewprod.hoganlovells.com/en/publications/fda-finalizes-computer-software-assurance-guidance-for-production-and-quality-system-software)
- QMSR replaced the QSR on 2 February 2026 and incorporates ISO 13485:2016 by reference. (snippet only, secondary) — [NSF](https://www.nsf.org/life-science-regulatory-news/fda-final-guidance-computer-software-assurance-csa); [IntuitionLabs](https://intuitionlabs.ai/articles/git-workflows-fda-compliance)
- ISO 13485 clause 4.1.6, as explained by practitioners on Elsmar Cove: "You need to validate the application of the software", and repeat after changes. Suggested effort scales with how far use departs from default use (Excel adding three numbers versus Excel flagging out-of-spec quality parameters). — [Elsmar thread](https://elsmar.com/elsmarqualityforum/threads/validation-of-software-regarding-iso-13485-2016.89461/page-2)
- A real nonconformity quoted in that thread: "Tool validation not fully effective (13485:2016 Cl. 4.1.6)", "Records of revalidation could not be found", "Risk assessment for ZohoDesk could not be found". A poster's reading: the gap is in how the company assesses and validates software, "not with the specific tool". — [Elsmar thread](https://elsmar.com/elsmarqualityforum/threads/validation-of-software-regarding-iso-13485-2016.89461/page-2)
- Practitioners recommend ISO/TR 80002-2:2017, AAMI TIR36 and GAMP 5 as method references. For a record-keeping tool: check it does what a record system must; if it records approvals, check it meets signature-system requirements. (snippet only) — [Elsmar 4.1.6 thread](https://elsmar.com/elsmarqualityforum/threads/software-validation-%E2%80%93-clause-4-1-6-of-iso-13485-2016.68045/page-2); [Elsmar issue-tracker thread](https://elsmar.com/elsmarqualityforum/threads/do-i-need-to-validate-my-issue-tracking-tool-for-software-problems.91731/)
- OpenRegulatory publishes a free software-validation SOP template mapped to ISO 13485 4.1.6, 6.3, 7.6 and IEC 62304 9.8: preliminary intended-use and risk assessment, a validation form, and a software list. (snippet only) — [OpenRegulatory SOP](https://openregulatory.com/document_templates/sop-software-validation)
- Ketryx validation package: shipped with every major and minor release; versioned PDFs and Excel files containing a requirements traceability matrix, release notes, a use-case-only software requirements specification and a testing report. Access needs a signed mutual NDA; no price stated. — [Ketryx blog](https://www.ketryx.com/blog/inside-ketryxs-customer-validation-package); [Ketryx support](https://support.ketryx.com/hc/en-us/articles/34460169025805-Where-can-I-find-Ketryx-validation-reports-for-the-Ketryx-Platform-itself)
- How customers use it, per Ketryx: either file it as supplier documentation with a short written rationale ("auditors routinely accept them as supplier documentation when paired with your short internal rationale"), or add testing of three to five workflows in their own configured environment, typically roles, permissions and key integrations. The rationale, risk assessment and any extra testing remain the customer's job. (vendor claim) — [Ketryx blog](https://www.ketryx.com/blog/inside-ketryxs-customer-validation-package)
- Matrix One includes in the subscription a validation package with IQ/OQ/PQ documentation, test scripts and traceability matrices "to support CSV or CSA", plus Part 11 e-signatures and audit trails on all products, with "no hidden fees or per-feature add-ons". — [Matrix One pricing](https://matrixone.health/pricing)
- Greenlight Guru's package model includes a validation package. (snippet only) — [rfp.wiki](https://www.rfp.wiki/specialty-industries/manufacturing/quality-management-system-software/greenlight-guru/zenqms)
- Qualio rejects IQ/OQ/PQ documents, arguing requirement-to-function-to-test traceability replaces them, while acknowledging a competitor offers IQ/OQ/PQ. (vendor FAQ, snippet only) — [Qualio validation FAQ](https://docs.qualio.com/en/articles/6666465-qualio-validation-faq)
- Paid validation services exist at the enterprise end: AssurX sells IQ/OQ test scripts and execution for installed systems. (snippet only) — [AssurX](https://www.assurx.com/wp-content/uploads/resources/brochures/assurx-eqms-validation-ds.pdf)
- OpenRegulatory states that "generic" software such as Google Drive or Jira/Confluence can be validated by the user. (snippet only) — [Atlassian community](https://community.atlassian.com/forums/App-Central-discussions/How-To-Set-Up-a-Jira-Confluence-QMS-For-Medical-Device/m-p/2953280)

### Inferences
- An RM tool holding design inputs, trace links and approvals is quality-system software under 4.1.6 and falls in CSA scope. It is not direct production software, so under CSA's risk logic most functions should sit at the lower-rigour end, with e-signature, audit trail and access control deserving the most attention. (Reasoned from the summaries; the guidance's own risk categories were not read.)
- Self-hosted open source is harder to validate than vendor SaaS in three specific ways: (1) the user performs the installation, so installation qualification is theirs; (2) the user controls upgrades, so revalidation after every change is theirs, which is exactly the finding quoted on Elsmar; (3) there is no supplier to audit or qualify unless the project behaves like one. It is easier in one way: the user controls when upgrades happen, whereas SaaS vendors push changes.
- A solo-founder open-source project can close most of that gap by acting like a supplier: release-pinned validation evidence (requirements, trace matrix, test report, release notes with known issues), a documented development process, and a template intended-use/risk assessment. Because the product is itself an RM tool, generating its own trace matrix is a credible demonstration.
- Assumption (c), partly disconfirmed: competitors bundle validation packs, Part 11 e-signatures and audit trails into the base subscription. Charging separately for these is against the market norm for small-medtech tools. SSO as a paid tier is common practice in SaaS generally, but no medtech-specific evidence was found.
- Being ISO 13485 certified as a vendor is used as a competitive point (Matrix One's comparison page says it is certified and Ketryx is not). Buyers' supplier-qualification procedures may ask for this; a solo founder will not have it. — [Matrix One comparison page](https://matrixone.health/alternatives/ketryx) (snippet only, partisan)

### Gaps
- The CSA final guidance text was not read. Unverified from primary text: the exact risk categories ("high process risk" versus "not high process risk" in the draft), what it says about leveraging vendor evidence and cloud/SaaS, and its Part 11 remarks.
- Regulatory text not fetched this session (background knowledge, verify): 21 CFR 820.70(i) required validation of software used in production or the quality system for its intended use; after 2 February 2026 the operative requirement comes through ISO 13485 4.1.6 and 7.5.6 as incorporated by the QMSR. 21 CFR Part 11 covers electronic records and signatures: validation, secure time-stamped audit trails, access controls, unique signatures linked to records, signature manifestation showing name, date and meaning. FDA's 2003 "Scope and Application" guidance announced enforcement discretion for some Part 11 provisions. GAMP 5 (second edition, 2022) uses software categories and encourages leveraging supplier documentation.
- No price found for any standalone validation pack. Historic practice of selling validation packs separately (for example for Atlassian apps or enterprise QMS) was not researched.
- EU side: no notified-body or MDCG document on QMS tool validation was found. ISO 13485 4.1.6 is the operative requirement for EU MDR manufacturers through the harmonised standard (background knowledge).

## 5. What features do medtech buyers expect bundled with requirements? Would RM-only look incomplete?

### Takeaway
Every medtech-specific competitor bundles risk management, test/verification records, e-signatures and document generation with requirements, and positions the trace from requirement to risk control to test as the product. An RM-only tool with no risk or test items will probably be judged incomplete for design controls, though the gap can be met with generic item types rather than dedicated modules.

### Cited Findings
- Greenlight Guru advertises built-in traceability between design inputs, outputs, verifications and product risk controls. (snippet only) — [Greenlight Guru](https://www.greenlight.guru/)
- Matrix Req is described as a full design control and eQMS platform covering requirements through CAPA and training; Matrix One lists risk management in Matrix Req and Matrix Quality, and Part 11 e-signatures and audit trails in all products. — [Matrix One pricing](https://matrixone.health/pricing); [Matrix One comparison](https://matrixone.health/alternatives/ketryx) (snippet only)
- Matrix Req is described in directories as letting teams write, validate and prepare technical documentation and import test cases. (snippet only) — [GetApp](https://www.getapp.com/all-software/a/matrix-requirements/)
- Jama Connect is listed as focused on "requirements traceability and risk management" for safety-critical projects. (snippet only) — [ONES.com](https://ones.com/blog/best-on-premises-defense-requirements-tools-for-2026/)
- Visure lists out-of-the-box templates for IEC 62304, 21 CFR Part 11 and ISO 13485 and automated trace-matrix generation. (vendor, snippet only) — [Visure](https://visuresolutions.com/medtech-and-pharma-guide/best-requirements-management-and-traceability-tools)
- Jira/Confluence is criticised specifically for lacking signing and risk management without plugins, and Doorstop for being requirements-only and therefore "not really QMS software". (snippet only) — [OpenRegulatory comparison](https://openregulatory.com/articles/qms-software-iso-13485-comparison)
- Ketryx's own validation pack trace matrix "references use-case requirements to their design inputs, outputs, and verification and validation tests", which is the trace shape buyers and auditors expect. — [Ketryx blog](https://www.ketryx.com/blog/inside-ketryxs-customer-validation-package)
- A consultancy explainer on traceable requirements for medical devices treats requirement-to-risk-to-test traceability as the core need. (snippet only; page not read) — [Hardian Health](https://www.hardianhealth.com/insights/what-you-need-to-know-about-traceable-requirements-for-medical-devices)

### Inferences
- The minimum credible medtech scope is: requirements at several levels, risk items (hazard, cause, risk control) linked to requirements, test cases with recorded results, e-signed review/approval, and export of a trace matrix and documents for the DHF or technical file. This project's design already has Risk and Test Case as item types; what would be missing is test execution records, risk scoring and signatures.
- "RM only, not ALM" is defensible if test results and risk analysis can be held as linked items or imported, and if the exported trace matrix covers requirement → risk control → verification. It is not defensible if the buyer must keep the risk file in Excel beside the tool, because that recreates the problem they are paying to remove.
- Document-shaped output matters: Innolitics delivering Word files and competitors generating technical documentation both indicate that submissions and audits still consume documents.

### Gaps
- No buyer-side statement found saying "we rejected tool X because it lacked risk or test". The conclusion rests on what competitors bundle.
- Design review records and DHF export expectations were not sourced in detail.

## 6. Typical tool budgets, sales cycles and how small medtech finds tools

### Takeaway
Reference prices show small teams pay roughly $5k to $55k a year for medtech-specific cloud tools, with resentment about opaque pricing and multi-year lock-in; hard data on sales cycles and discovery channels was not found.

### Cited Findings
- Greenlight Guru: no list prices; Vendr procurement data puts median annual spend near $44k with deals from about $21k to $55k. Another guide estimates $30k+ a year and reports mandatory 3-year contracts. (third-party estimates, snippet only) — [rfp.wiki](https://www.rfp.wiki/specialty-industries/manufacturing/quality-management-system-software/greenlight-guru/zenqms); [MedDeviceGuide](https://meddeviceguide.com/blog/best-eqms-software-medical-devices-2026-guide)
- OpenRegulatory says Greenlight Guru raised prices significantly around 2025 and customers migrated away as a result. (competitor's claim, snippet only) — [OpenRegulatory](https://openregulatory.com/greenlight-guru-alternative)
- Matrix Req: SoftwareAdvice lists a starting price of USD 470 (per user basis), with $700 and $1,050 per month tiers. The vendor's own page now says pricing is bespoke with annual subscriptions and "we do not sell generic tiers", so the directory figures may be stale. — [SoftwareAdvice](https://www.softwareadvice.com.au/software/336473/matrix-requirements-medical) (snippet only); [Matrix One pricing](https://matrixone.health/pricing)
- ZenQMS: flat annual subscription, unlimited users; third-party estimates of $18k to $35k for small organisations. (snippet only) — [rfp.wiki](https://www.rfp.wiki/specialty-industries/manufacturing/quality-management-system-software/greenlight-guru/zenqms)
- Polarion X Base starts at $42 per month with a 20-user limit (ambiguous whether per user); Codebeamer is listed at about $1,500 per user per year on GetApp (attribution uncertain); Jama publishes no prices. (snippet only) — [G2 Jama vs Polarion](https://www.g2.com/compare/jama-connect-vs-polarion); [GetApp Codebeamer](https://www.getapp.com/it-management-software/a/codebeamer/compare/); [G2 Jama pricing](https://www.g2.com/products/jama-connect/pricing)
- OpenRegulatory Formwork competes on a free tier, unlimited users and monthly cancellation; Jira/Confluence is "priced per user, and it's reasonable" but needs setup and has no built-in validation. (snippet only, partisan) — [Atlassian community](https://community.atlassian.com/forums/App-Central-discussions/How-To-Set-Up-a-Jira-Confluence-QMS-For-Medical-Device/m-p/2953280); [OpenRegulatory Jira/Confluence review](https://openregulatory.com/qms-software/confluence-jira/)
- Consultants act as a channel and sometimes as a competitor: Innolitics requires clients to use its own templates and software during a project. (snippet only) — [Innolitics](https://innolitics.com/services/)

### Inferences
- There is real price and lock-in dissatisfaction to sell against. A transparent, low-priced, exportable tool addresses a stated complaint. That is a stronger wedge than self-hosting.
- The low end is already contested by a free-tier, consultant-led competitor (OpenRegulatory Formwork) with strong content marketing and a regulatory-consulting funnel. Its founders' consulting practice is the distribution channel, which a solo developer without regulatory credentials lacks.
- Consultants and fractional QA/RA leads likely set tool choice for many startups, since they bring templates and a preferred stack. Winning a few consultancies may matter more than direct sales. (Opinion.)

### Gaps
- No data found on sales cycle length for small medtech, or on how buyers discover tools (consultants, auditors, peers, review sites).
- No verified current pricing for Qualio, Ketryx or Jama.
- Timing matters and was not researched: startups usually buy tooling shortly before starting formal design controls or a first ISO 13485 audit, and rarely switch mid-project.

## 7. Do auditors or notified bodies care which tool is used, or distrust open source or unknown vendors?

### Takeaway
The available evidence says auditors assess the manufacturer's validation evidence and records, not the brand or licence of the tool; no documented case of an auditor rejecting an open-source tool was found. The risk for an unknown open-source tool is the buyer's fear of an audit finding, not a rule.

### Cited Findings
- In the Elsmar thread on a 4.1.6 nonconformity, the finding concerned missing risk assessment and revalidation records; a poster summarised that the gap is "not with the specific tool". — [Elsmar thread](https://elsmar.com/elsmarqualityforum/threads/validation-of-software-regarding-iso-13485-2016.89461/page-2)
- OpenRegulatory's notified body survey article reports that some notified bodies are "more open to modern approaches, like using GitLab as a QMS tool"; implying others are less open. No named body. (snippet only, anecdotal) — [OpenRegulatory notified body survey](https://openregulatory.com/articles/the-great-notified-body-survey-2022)
- OpenRegulatory says its Formwork tool "has been accepted by all auditors so far" and that it works with BerlinCert, a notified body focused on SaMD, on audit data formats. (vendor claim, snippet only) — [OpenRegulatory](https://openregulatory.com/)
- Ketryx quotes a customer that auditors were "amazed by the level of detail, linkage and control". (testimonial, snippet only) — [Ketryx eQMS](https://www.ketryx.com/capabilities/eqms)
- Ketryx says auditors "routinely accept" its validation documents as supplier documentation when paired with a short internal rationale. (vendor claim) — [Ketryx blog](https://www.ketryx.com/blog/inside-ketryxs-customer-validation-package)
- Docs-as-code caveat from a secondary guide: a plain Git commit or PR approval may not satisfy Part 11 signature requirements without extra controls. (snippet only) — [IntuitionLabs](https://intuitionlabs.ai/articles/git-workflows-fda-compliance)

### Inferences
- Auditor acceptance depends on three things a tool can make easy or hard: a documented intended-use and risk assessment, validation records that are redone after each change, and trustworthy records (audit trail, access control, signatures that carry name, date and meaning). An open-source tool that ships these artefacts is on equal footing in principle.
- In practice a QA/RA lead at a 20-person company is risk-averse and will be asked by an auditor "how did you qualify this supplier?". A recognisable vendor with a certificate and a pack is the low-effort answer. For an unknown solo-founder project the lead must write the justification themselves. Expect this to be the main sales objection.
- Variation between notified bodies and individual auditors is real (the "more open" wording implies it), so early design-partner audits are the proof that matters; one or two "passed a notified body audit using this tool" references would be worth more than any feature.

### Gaps
- No written policy from any notified body, FDA or MDCG about tool choice or open-source tools was found.
- No first-hand account of an audit where an open-source RM or QMS tool was challenged or praised. Reddit and LinkedIn were not reached.

## Summary against the founder's three assumptions

(Synthesis of the sections above; all sourcing is there.)

- **(a) Small teams mostly use Word and Excel: plausible, not proven.** Supported only by vendor-sponsored surveys without a size breakdown. For SaMD teams, Jira/Confluence is an equally likely incumbent.
- **(b) They value self-hosting and open source: evidence points the other way for small medtech.** Every tool built for this segment is cloud-first or cloud-only and sells "no IT needed". Explicit self-hosting demand is documented for aerospace and defence (ITAR, CMMC with FedRAMP Moderate for cloud). What small medtech does complain about is price, lock-in and data export.
- **(c) They will pay for a validation pack, e-signatures and SSO: weak.** Competitors bundle the validation pack, Part 11 signatures and audit trails in the base price. These are entry requirements, not upsells. No evidence found either way on SSO.
- **Not asked but material:** an RM-only tool without linked risk and test records will look incomplete next to every medtech-specific competitor; and the low-price, transparent, startup-friendly position is already occupied by OpenRegulatory Formwork, which has a consulting-led channel.
