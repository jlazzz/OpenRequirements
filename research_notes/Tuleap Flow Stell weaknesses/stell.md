# Stell (Stell Engineering, Inc.): product, deployment, pricing, weaknesses, and small rivals

Research date: 2026-10-12. Company identity confirmed: Stell Engineering, Inc., website **stell-engineering.com** (with a hyphen). `stell.com` is an unrelated site and `stellengineering.com` is a parked domain for sale at USD 30,000 ([stellengineering.com](https://stellengineering.com)). Founders Malory McLemore and Anne Wen, pre-seed USD 3.1M (Jan 2023), seed USD 4M (Feb/Mar 2024).

Labels used below: **[vendor]** = Stell's own claim, not independently verified. **[third party]** = press, law firm, directory or analyst page. Stell's site pages all carry a "published Oct 12, 2026" metadata stamp, which is a site rebuild date, not the date of the content; article dates are given where the page states them.

Important caveat for the whole file: most "missing feature" findings mean "not mentioned on any public page I could read". Stell has no public documentation, no public changelog and no trial. Absence from marketing is not proof of absence from the product.

## 1. Product: what exactly does Stell do, and is it a general RM tool or a narrower compliance/flow-down tool?

### Takeaway
As of 2026 Stell sells itself as a general "AI-native requirements management" tool for aerospace and defence hardware teams, not only a flow-down tool. Its centre of gravity is still the inbound customer document: import a PDF contract/spec/standard, turn it into a compliance matrix, attach verification evidence, share the matrix read-only with customers and suppliers. It pivoted into RM from a supplier/purchasing workflow idea in 2023.

### Cited Findings
- [vendor, 2026] Home page positioning: "AI-powered, systems engineering software crafted by aerospace engineers"; requirements management for hardware and systems engineers in regulated industries. Named replacement targets: Jama Connect, IBM DOORS, Polarion, Jira, Confluence, Word, Excel, SharePoint — [Stell home](https://www.stell-engineering.com/)
- [vendor, 2026] Feature list: Two Views (rich document editor and structured compliance matrix), PDF Import, Compliance Matrix, V&V Tracking (evidence records linked to requirements), Graph View (parent-child relationships), global Search, API with keys scoped to a programme, Sharing/Supplier Portal, Standards Library — [Stell product page](https://www.stell-engineering.com/product)
- [vendor, 2026] PDF import claim: Stell can "import and digitize PDF specifications" and says no other tool does this automatically. Product page also says "Import PDFs, Excel, or Word in one click" — [Stell product page](https://www.stell-engineering.com/product)
- [vendor, 2026] Sharing Portal: customers and suppliers "get read-only access to exactly what they need" — [Stell product page](https://www.stell-engineering.com/product)
- [vendor, Apr 2026] Standards Library: blog post titled "Stell's Standards Library Turns Hundreds of Pages of Industry Standards into Ready-to-Use Requirements"; shared across all Stell users. Individual standards are not listed publicly — [Stell blog index](https://www.stell-engineering.com/blog), [Stell product page](https://www.stell-engineering.com/product)
- [vendor, 2026] AI agent "Zelda": query for non-compliant requirements, traceability gaps and missing evidence; compare two versions of a document and flag added/removed/tightened requirements; create evidence records and mark requirements verified from one instruction; import Jira records as evidence; write requirements; trace the impact of upstream changes to child requirements; risk registers. "No change executes without explicit user approval." Runs on AWS Bedrock inside the GovCloud boundary — [Stell Zelda page](https://www.stell-engineering.com/zelda)
- [vendor, Aug 2026] "Zelda MCP: Connect Stell Requirements, Specs, and Engineering Data to Your AI Tools" (blog title only; body not read) — [Stell blog index](https://www.stell-engineering.com/blog)
- [third party, Jan 2023] Original idea: digitise parts-ordering workflows between A&D customers and suppliers including machine shops, replacing spreadsheets, emailed PDFs and supplier portals — [TechCrunch, 17 Jan 2023](https://techcrunch.com/2023/01/17/stell-wants-to-modernize-the-unsexy-workflows-slowing-down-americas-industrial-base)
- [third party, Mar 2024] Pivot: Stell first planned a purchasing/supply-chain tool, then "after customer feedback" moved first into requirements management; supplier connectivity and supply-chain functions were described as still in the pipeline. First version shipped June 2023 to one customer — [TechCrunch, 11 Mar 2024](https://techcrunch.com/2024/03/11/stell-raises-new-tranche-of-funding-to-keep-engineers-building-not-filling-out-paperwork/)
- [vendor, undated LinkedIn description] Workflow: import customer requirements via CSV and PDF, build digital specifications, track relationships and verification, manage change requests, generate reports for SRR, PDR and CDR — [Stell LinkedIn](https://www.linkedin.com/company/stell-engineering)
- [vendor, Nov 2025] Space RCO work adds "tools for integrating system-of-systems interfaces across hardware, software, and firmware"; Space Systems Command uses Stell for interface specifications — [Stell blog, Space RCO contract](https://stell-engineering.com/blog/stell-awarded-space-rco-contract-to-deploy-software-for-rapid-systems-integration)

### Inferences
- Stell is now a direct, general RM competitor in positioning (it names Jama and DOORS as what teams switch from), but its differentiators are all on the intake and compliance side: PDF-to-matrix, standards library, evidence/V&V, AI agent. It is "compliance-matrix-first RM", where Jama and the founder's tool are "item-tree-first RM".
- The supplier side is thin: a read-only sharing portal. The two-way prime-to-supplier flow-down network that the 2023 pitch described is not visible in the 2026 product. The brief's framing of Stell as "focused on requirement flow-down between primes and suppliers" describes the 2023 pitch better than the 2026 product.
- Customer pull has come from government programme offices and space companies, not from machine shops (see section 5).

### Gaps
- No public documentation, screenshots of the data model, or demo video were read; feature depth is unknown.
- Whether the Sharing Portal allows supplier responses (compliance status, comments) or is strictly read-only beyond the "asynchronous approvals" mention could not be confirmed.

## 2. Formal RM features: versions with diff, baselines, typed links, matrix, suspect links, reviews, audit trail, export, ReqIF/DOORS

### Takeaway
Publicly confirmed: parent-child and evidence links, graph view, compliance matrix, some audit history, AI-driven document version comparison, some form of approvals in the portal, change requests (LinkedIn blurb only). Not mentioned anywhere public: baselines, per-item revision history with diff, typed link taxonomy, rule-based suspect links, formal review with electronic sign-off, any export format, ReqIF, a DOORS importer.

### Cited Findings
- [vendor, 2026] Product page does not mention versioning, diff/redline, baselines, change requests, suspect links, reviews/approvals or any export format; the audit trail appears only as "a complete audit trail baked in" under V&V Tracking — [Stell product page](https://www.stell-engineering.com/product)
- [vendor, 2026] Links described: parent-child relationships, dependencies, links to standards, links to evidence. "Bidirectional links between requirements, verification, and evidence, with automatic linking." No list of user-defined link types — [Stell home](https://www.stell-engineering.com/), [Stell product page](https://www.stell-engineering.com/product)
- [vendor, 2026] Version comparison exists as an AI feature: Zelda "compares two versions of a document, summarizes changes" and flags changed requirements. Impact of upstream changes is traced by the AI agent on request — [Stell Zelda page](https://www.stell-engineering.com/zelda)
- [vendor, Mar 2026] In its own comparison article Stell credits DOORS with "comprehensive versioning and baseline management" and "configuration control", and Jama with "structured stakeholder reviews and approvals"; for itself it claims "complete audit history", and for the Sharing Portal "asynchronous approvals" and "comprehensive activity logs". Stell's self-listed weaknesses: "Newer market entrant" and DOORS users "may require initial adjustment" — [Stell blog, best RM tools](https://stell-engineering.com/blog/best-requirements-management-tools)
- [vendor, May 2026] DOORS-alternatives article offers a three-phase migration guide ("Use structured migration utilities", "Preserve historic traceability", "Stell is with you for this entire process") but does not describe an importer, and never mentions ReqIF. It says a true alternative "must maintain version integrity" without describing Stell's mechanism — [Stell blog, DOORS alternatives](https://stell-engineering.com/blog/ibm-doors-alternatives)
- [vendor, 2026] Import formats named: PDF, Word, Excel (product page); CSV and PDF (LinkedIn). ReqIF is not mentioned on the home, product, AI, A&D, security, or the two comparison blog pages — [Stell product page](https://www.stell-engineering.com/product), [Stell LinkedIn](https://www.linkedin.com/company/stell-engineering)
- [vendor, 2026] In the same article Stell lists Visure as supporting "Excel, Word, ReqIF, and CSV" import/export, while stating no export format for itself — [Stell blog, best RM tools](https://stell-engineering.com/blog/best-requirements-management-tools)
- [third party, Jul 2026] Airframe.ai's analysis lists "version/revision control, change tracking, and audit trails" as vendor-stated features — [Airframe.ai analysis](https://www.airframe.ai/product/stell-engineering-com/analysis)
- [vendor, 2026] API is described as read-oriented: "Pull specifications, requirements, and sections straight into your own systems" — [Stell product page](https://www.stell-engineering.com/product)
- [vendor, 2026] Terms of service: customer data is retrievable for 30 days after termination, then deleted. The retrieval format is not stated — [Stell terms of service](https://www.stell-engineering.com/legal/terms-of-service)

### Inferences
- Stell most likely has document-level versions and an activity log, since the AI compares "two versions of a document" and a third-party page lists revision control. What is not evidenced is the formal configuration-management layer: named immutable baselines, baseline-to-baseline comparison, per-item revision diff, and deterministic suspect-link flags. In Stell the "what changed and what does it affect" answer is presented as an AI query, not as a rule-based flag. Auditors in DO-178C/AS9100-style environments usually want the deterministic version.
- No stated export path and no ReqIF is the clearest lock-in and interoperability gap. A supplier that receives a DOORS module as ReqIF from a prime, and must return a ReqIF or Word/Excel compliance matrix, has no publicly documented round trip in Stell.
- These are the features the founder's tool already has or plans (append-only revisions with diff, baselines, typed links, suspect links, ReqIF). The overlap with Stell's proven strengths (PDF parsing, standards library, evidence tracking, AI agent, certifications) is small in both directions.

### Gaps
- Could not confirm or rule out baselines, e-signatures, Word/Excel/PDF export, or ReqIF. A demo or a customer conversation is the only way to settle these. Treat them as "undocumented", not "absent".
- No public API reference; whether the API can write is unknown.

## 3. Deployment and compliance posture

### Takeaway
Stell is multi-tenant SaaS on AWS GovCloud (US) only. No self-hosted, on-premises or air-gapped customer install is offered or mentioned anywhere public. Its compliance stack is strong and is its main moat: IL5 ATO with the US Space Force, CMMC Level 2 certified (Mar 2026), FedRAMP Moderate Equivalency via a 3PAO (Oct 2026), SOC 2 Type II (Dec 2024), ITAR, all-US-person staff.

### Cited Findings
- [vendor, 2026] "100% AWS GovCloud (US)"; "Built on AWS GovCloud by a 100% US-person team", staff background-checked; all data processed and stored on US infrastructure — [Stell security page](https://stell-engineering.com/security)
- [vendor, 2026] "Active IL5 ATO" under the US Space Force — [Stell security page](https://stell-engineering.com/security)
- [vendor, Dec 2024] SOC 2 Type II announced 20 Dec 2024 — [Stell security page](https://stell-engineering.com/security)
- [vendor, Mar 2026] "CMMC L2 Certified", announced 31 Mar 2026, described as full compliance with NIST 800-171 — [Stell security page](https://stell-engineering.com/security)
- [vendor, Oct 2026] FedRAMP Moderate Equivalency for the commercial "Stell Requirements Management System (SRMS)", assessed by 3PAO ControlCase, announced 6-7 Oct 2026; Stell says contractors "can now store covered defense information in Stell under DFARS 252.204-7012". This is equivalency, not a FedRAMP authorization; the site also says "FedRAMP Ready, listed on the marketplace" — [24-7 Press Release](https://www.24-7pressrelease.com/press-release/539368/stell-engineering-achieves-fedramp-moderate-equivalency-for-its-requirements-management-platform), [Stell security page](https://stell-engineering.com/security)
- [vendor, Mar 2026] A March 2026 release distinguished two environments: an IL5 platform on AWS GovCloud with an ATO, and a "commercial platform" then still pursuing FedRAMP Moderate equivalency — [press release syndication](https://stocks.observer-reporter.com/observerreporter/article/247pressrelease-2026-3-30-stell-engineering-achieves-cmmc-level-2-certification)
- [vendor, 2026] AI: "All AI inference runs in-boundary"; "No external model calls"; powered by AWS Bedrock; "Stell does not train models on customer content" — [Stell security page](https://stell-engineering.com/security), [Stell Zelda page](https://www.stell-engineering.com/zelda)
- [vendor, 2026] Authentication via Okta, Microsoft Entra and Duo with "native CAC support"; FIPS 140-2 validated encryption in transit and at rest; HSM key management — [Stell security page](https://stell-engineering.com/security)
- [vendor, 2026] On-premises, self-hosted and air-gapped are not mentioned on the home, product, security, A&D or terms pages. Terms describe the service as SaaS — [Stell security page](https://stell-engineering.com/security), [Stell terms of service](https://www.stell-engineering.com/legal/terms-of-service)
- [vendor, Nov 2025] The Space RCO contract funds "a multi-layered secure deployment infrastructure" at the CUI level with "one-way connections into a high-side environment" — [Stell blog, Space RCO contract](https://stell-engineering.com/blog/stell-awarded-space-rco-contract-to-deploy-software-for-rapid-systems-integration)
- [third party, Jul 2026] "No other deployment models (on-prem, private cloud...) are documented" — [Airframe.ai analysis](https://www.airframe.ai/product/stell-engineering-com/analysis)
- [vendor, job posting, date unknown] Hires must be US citizens or green card holders "due to ITAR restrictions" — [Stell job posting via search result](https://stell-engineering.notion.site/Sr-Software-Engineer-8fe0dbc0f47a4c03ab380060e4cef69a?pvs=4)

### Inferences
- For a US subcontractor allowed to put CUI in a cloud, Stell now ticks every box (DFARS 7012 equivalency, CMMC L2, ITAR, US persons). A solo founder cannot match this as a hosted service: a 3PAO assessment, a C3PAO assessment and an IL5 ATO cost far more than a solo project can spend. Do not compete with Stell as a hosted CUI service.
- Self-hosting changes the question instead of answering it. Software running inside the customer's own boundary is covered by the customer's own CMMC assessment; the vendor needs no FedRAMP status. That is a real structural opening, but it moves the burden to the customer's IT, and the buyer will still ask for an SBOM, hardening guidance, FIPS-validated crypto options and audit logging mapped to NIST 800-171 controls.
- Stell's one known move towards disconnected environments (one-way transfer to a high side for Space RCO) is a government-funded custom deployment, not a product a 20-person shop can buy. It does show Stell can build isolated deployments when paid USD 5.8M to do so.
- Stell's AI depends on AWS Bedrock in GovCloud. That makes a true air-gapped install hard for Stell without re-engineering the AI features, which are its main differentiator.
- Non-US customers are effectively excluded: GovCloud-only hosting and US-person-only staff. Canadian, UK, EU and Australian defence suppliers (the founder appears to be outside the US segment Stell serves, or at least can serve those markets) are not addressed by Stell at all.

### Gaps
- Could not confirm with Stell whether a private or on-premises deployment is available on request. Public silence plus a SaaS-only terms page suggests not, but this is unconfirmed.
- The FedRAMP equivalency body of evidence and the CMMC certificate were not independently verified; only press releases were found.
- FedRAMP "High and Moderate equivalent assessments" are mentioned in one Stell blog post; the High claim was not corroborated elsewhere.

## 4. Pricing

### Takeaway
No price is published anywhere and no third-party report gives a number. Sales are demo-led with fees set in a private Sales Order; there is no free tier, trial or self-serve sign-up.

### Cited Findings
- [vendor, 2026] No pricing on the home or product pages; the only call to action is a 30-minute demo — [Stell home](https://www.stell-engineering.com/)
- [vendor, 2026] Terms: fees are set in a "Sales Order"; usage above the ordered "Service capacity" is billed; invoices due in 30 days; 1.5% monthly finance charge on late balances; Stell may change fees on 30 days' notice. Minimum term, auto-renewal and per-seat versus per-programme basis are not stated — [Stell terms of service](https://www.stell-engineering.com/legal/terms-of-service)
- [third party, Mar 2024] Stell "sells licenses" to its RM product; no price given — [TechCrunch, 11 Mar 2024](https://techcrunch.com/2024/03/11/stell-raises-new-tranche-of-funding-to-keep-engineers-building-not-filling-out-paperwork/)
- [third party, Jul 2026] "Not published. The site is demo-led and lists no tiers or self-serve purchase option"; recommends a paid pilot — [Airframe.ai analysis](https://www.airframe.ai/product/stell-engineering-com/analysis)
- [vendor, Mar 2026] Stell's own comparison marks DOORS and Jama with "Cost / Seat" as a drawback, without giving its own pricing basis — [Stell blog, best RM tools](https://stell-engineering.com/blog/best-requirements-management-tools)

### Inferences
- With USD 7M of venture money, about 26-30 staff and a GovCloud/IL5 cost base, Stell needs enterprise-sized contracts. A price a 10-person shop would pay casually is unlikely, but this is inference only.
- Opaque pricing and a mandatory sales call are a friction point that an open-source tool with a published price (or free self-host) can exploit for the smallest buyers.

### Gaps
- No per-seat or per-programme figure, minimum contract, or pilot terms found from any source. G2 pricing page was not readable (HTTP 403).

## 5. Customers and target size

### Takeaway
No commercial customer is named publicly. Confirmed users are US government space organisations (Space RCO, Space Systems Command) reached through SBIR contracts. Stell says commercial users include satellite companies, shipbuilders and battery makers. There is no evidence of adoption by small machine shops or component suppliers. US only.

### Cited Findings
- [vendor, Nov 2025] SBIR Phase III from the Space Rapid Capabilities Office: USD 5.8M over 24 months for Space RCO-tailored enhancements and secure deployment — [Stell blog, Space RCO contract](https://stell-engineering.com/blog/stell-awarded-space-rco-contract-to-deploy-software-for-rapid-systems-integration)
- [vendor / third party, Feb-Mar 2024] AFWERX Direct-to-Phase II SBIR, USD 1.24M, serving Space Systems Command offices (AATS, SSIO), with SETA contractors ManTech and Alpha Omega Group involved — [TechCrunch, 11 Mar 2024](https://techcrunch.com/2024/03/11/stell-raises-new-tranche-of-funding-to-keep-engineers-building-not-filling-out-paperwork/), [Stell blog, Space RCO contract](https://stell-engineering.com/blog/stell-awarded-space-rco-contract-to-deploy-software-for-rapid-systems-integration)
- [vendor, Nov 2025] Commercial users described as "satellite companies, shipbuilders, and battery manufacturers"; none named — [Stell blog, Space RCO contract](https://stell-engineering.com/blog/stell-awarded-space-rco-contract-to-deploy-software-for-rapid-systems-integration)
- [third party, Mar 2024] Three early customers, all in the space industry — [TechCrunch, 11 Mar 2024](https://techcrunch.com/2024/03/11/stell-raises-new-tranche-of-funding-to-keep-engineers-building-not-filling-out-paperwork/)
- [vendor, 2026] "Trusted by US aerospace and defense teams"; "Trusted across Space Force, Air Force, and defense prime programs". No logos, case studies or testimonials on the site. Company sizes and machine shops are not mentioned — [Stell A&D page](https://www.stell-engineering.com/aerospace-defense), [Stell home](https://www.stell-engineering.com/)
- [third party, 2026] One G2 review, 4.5/5, from a small aerospace company praising interface and support (from a search summary; the G2 page itself returned 403) — [G2 Stell reviews](https://www.g2.com/products/stell-requirements-management/reviews)
- [third party, Jul 2026] Best-fit buyers assessed as "small-to-midsize aerospace, defense, and advanced manufacturing firms, including small defense contractors and subcontractors handling CUI" — [Airframe.ai analysis](https://www.airframe.ai/product/stell-engineering-com/analysis)
- [vendor, 2023] A blog post "Stell & Onyx" (Oct 2023) suggests an early customer or partner; body not read — [Stell blog index](https://www.stell-engineering.com/blog)

### Inferences
- Known government contract value (USD 1.24M + USD 5.8M = about USD 7M) is roughly equal to all venture capital raised. Stell's roadmap is therefore strongly shaped by Space Force needs: IL5, high-side transfer, system-of-systems interface specs. That pulls it up-market and towards government, away from the 10-50 person subcontractor.
- Stell is not "a funded rival in exactly that segment" in the sense of having won small subcontractors. It markets to them, and is now compliance-ready for them, but the public evidence of traction is government programme offices and new-space companies.

### Gaps
- No named commercial customer, customer count, or revenue figure after March 2024.
- No evidence either way on whether primes mandate or recommend Stell to their suppliers.

## 6. Company: founders, funding, headcount, pivot

### Takeaway
Founded 2022 by Malory McLemore (CEO; ex-Airbus, Raytheon, first PM at Hadrian) and Anne Wen (VC and space startup background); both Harvard MBAs. About USD 7.1M raised in two rounds; no later venture round found through Oct 2026. Headcount about 26-30. Non-dilutive SBIR money has been as large as the venture money.

### Cited Findings
- [third party, Jan 2023] Founders and backgrounds; USD 3.1M pre-seed led by Wischoff Ventures and Third Prime; company under six months old — [TechCrunch, 17 Jan 2023](https://techcrunch.com/2023/01/17/stell-wants-to-modernize-the-unsexy-workflows-slowing-down-americas-industrial-base)
- [third party, Mar 2024] USD 4M seed closed Feb 2024, led by Long Journey Ventures and Cyan and Scott Banister; also Third Prime, Wischoff Ventures, Urban Innovation Fund, Forward Deployed VC, Fulcrum Venture Group, angels. Team of six at the time; Los Angeles-based — [TechCrunch, 11 Mar 2024](https://techcrunch.com/2024/03/11/stell-raises-new-tranche-of-funding-to-keep-engineers-building-not-filling-out-paperwork/), [Crowell & Moring](https://www.crowell.com/en/insights/firm-news/crowell-and-moring-advises-stell-engineering-in-dollar4-million-seed-funding-round)
- [vendor, Nov 2025] "Has raised $7M in venture capital", offices in Los Angeles and San Francisco — [Stell blog, Space RCO contract](https://stell-engineering.com/blog/stell-awarded-space-rco-contract-to-deploy-software-for-rapid-systems-integration)
- [third party, date unknown] A Form D notice for USD 7,182,498 in new equity is reported by an aggregator (headline only seen; not read in full) — [intelligence360](https://www.intelligence360.news/stell-engineering-has-filed-a-notice-of-an-exempt-offering-of-securities-to-raise-7182498-00-in-new-equity-investment/)
- [third party, Jul 2026] About 30 FTEs, San Francisco HQ, USD 7.2M raised, reported valuation USD 26M (unverified aggregator figures) — [Airframe.ai analysis](https://www.airframe.ai/product/stell-engineering-com/analysis)
- [vendor, Oct 2026] LinkedIn shows 26 employee profiles (size band still says 2-10), HQ San Francisco, 5,051 followers; posts about demoing to "50+ teams" at SmallSat — [Stell LinkedIn](https://www.linkedin.com/company/stell-engineering)
- [vendor, 2026] About page: founded 2022; deployed on US Space Force and Air Force programmes — [Stell about page](https://www.stell-engineering.com/about)

### Inferences
- No Series A in the 2.5 years after the seed, as far as public sources show. The company appears to be funded by SBIR Phase III revenue plus seed money. That is survivable but it is not the profile of a runaway commercial winner; it is also not a dying company (headcount grew from 6 to about 26-30, and it shipped three major certifications in 2026).
- The conflicting HQ (Los Angeles, Marina del Rey, Venice, San Francisco) reflects a move or second office, not a different company.

### Gaps
- Whether Anne Wen is still at the company was not checked.
- No revenue, ARR or commercial customer count found.
- A round after Mar 2024 cannot be ruled out; none was found.

## 7. User complaints, limitations, lock-in, reviews

### Takeaway
There is almost no independent user voice on Stell: one G2 review, no Reddit or Hacker News threads found. Weaknesses below are therefore structural observations from public material, not user complaints.

### Cited Findings
- [third party, Jul 2026] "Very limited public proof: few or no reviews, no detailed case studies with quantified outcomes"; no Reddit/HN threads found; migration from entrenched toolchains could be costly; "likely overkill" for organisations that do not need FedRAMP/IL5-level controls — [Airframe.ai analysis](https://www.airframe.ai/product/stell-engineering-com/analysis)
- [third party, 2026] G2: one review, 4.5/5 (page not directly readable) — [G2 Stell reviews](https://www.g2.com/products/stell-requirements-management/reviews)
- [vendor, 2026] AI outputs are provided "as-is" with no accuracy guarantee; the customer is responsible for verifying them. Stell may use aggregated or de-identified usage data, "including machine learning data", to improve the service — [Stell terms of service](https://www.stell-engineering.com/legal/terms-of-service)
- [vendor, 2026] Data retrievable for 30 days after termination, then deleted; export format unspecified; fees changeable on 30 days' notice — [Stell terms of service](https://www.stell-engineering.com/legal/terms-of-service)
- [vendor, 2026] No export formats, ReqIF, or baselines documented (see section 2) — [Stell product page](https://www.stell-engineering.com/product)

### Inferences
- Concrete, checkable gaps a competitor can state without exaggeration: (1) no self-hosted or air-gapped option documented; (2) no ReqIF or documented DOORS round trip; (3) no documented export or baseline mechanism; (4) no public price, trial or docs; (5) closed source, with a 30-day data retrieval window; (6) US-only; (7) accuracy of AI-parsed requirements is the customer's responsibility.
- The terms' "aggregated or de-identified ... machine learning data" clause sits awkwardly beside the marketing line "does not train models on customer content". Not a contradiction in law, but a cautious CUI holder would ask about it.
- The absence of complaints is not evidence of satisfaction; it mainly shows a small installed base.

### Gaps
- No user-reported limitations found at all. A real picture needs conversations with Stell users, for example the 50+ SmallSat teams it demoed to.

## 8. Other rivals in the small defence/aerospace supplier segment

### Takeaway
I could confirm published prices for Flow Engineering, Valispace/Altium Requirements Portal, Cradle and (a starting price only) Visure. On-premises is documented for Jama, Visure and Cradle; Flow lists self-hosting in secondary sources. I could not confirm deployment or pricing for Trace.Space or Innoslate from primary sources in this session. I found no data on what 10-50 person subcontractors actually buy.

### Cited Findings
- **Flow Engineering** [vendor, 2026]: Basic USD 150 per editor per month (500 requirements, 1 project); Pro USD 300 per editor per month (5,000 requirements, 5 projects); Enterprise custom, and "ITAR AWS GovCloud" plus SSO/SAML are Enterprise-only. Self-hosting is not on the pricing page — [Flow pricing](https://www.flowengineering.com/pricing). Secondary listings say Flow can be deployed as SaaS, GovCloud or self-hosted, and is SOC 2 Type II and NIST 800-171 aligned — [beri.net](https://www.beri.net/tools/flow-engineering), [Flow security](https://www.flowengineering.com/security)
- **Valispace / Altium Requirements Portal** [vendor, 2026]: Valispace was acquired by Altium and became Requirements & Systems Portal on Altium 365 (announced Sep 2024). Pricing page shows USD 999 per user per year, minimum 3 users, with on-premise deployment "Optional" and GovCloud listed; another Altium message on the page quotes USD 995 per year. Altium's migration guide moves former Valispace deployments to the Altium 365 cloud, so the status of on-prem is unclear — [Valispace pricing](https://www.valispace.com/pricing/), [Altium migration guide](https://www.altium.com/documentation/altium-365/requirements-systems-portal/migration-what-you-need-know), [Business Wire, Sep 2024](https://www.businesswire.com/news/home/20240912616273/en/Requirements-Systems-Portal-Application-Now-Available-on-the-Altium-365-Cloud-Platform)
- **Jama Connect**: no public price; supports cloud and on-premise per Stell's own comparison ("Flexible deployment supports both cloud and on-premise installations"). One reviewer calls it "just on that cusp of being affordable for a small company" — [Stell blog, best RM tools](https://stell-engineering.com/blog/best-requirements-management-tools), [PeerSpot/IT Central Station](https://www.itcentralstation.com/products/jama-connect-pricing)
- **Visure Requirements**: starting price listed as USD 2,990 (basis not stated: per seat, per year or perpetual); Windows and Linux on-premise deployment listed; ReqIF, Word, Excel, CSV import/export per Stell's article — [Capterra UK](https://www.capterra.co.uk/software/146581/visure-requirements), [Stell blog, best RM tools](https://stell-engineering.com/blog/best-requirements-management-tools)
- **Cradle (3SL)**: list prices on TrustRadius: Cradle-RM Desktop USD 449, RM Pro USD 529, SE Desktop USD 599, SE Pro USD 679, Enterprise by quote; licensed as floating concurrent module licences. The basis of the listed prices is not clear — [TrustRadius](https://tr-web.dev.trustradius.com/compare-products/3sl-cradle-vs-casecomplete)
- **Innoslate (SPEC Innovations)**: pricing "available on request" with a free version and trial listed; described on directories as cloud-based — [Capterra CA](https://www.capterra.ca/software/136479/innoslate)
- **Trace.Space**: described as an "AI-first system of creation for complex hardware specifications", Miami-based; no deployment or pricing found — [Chopping Block profile](https://www.choppingblock.ai/companies/trace-space)
- **Codebeamer, Polarion, DOORS**: Stell's own comparisons list them as the enterprise incumbents with heavy administration and per-seat cost; no prices given — [Stell blog, best RM tools](https://stell-engineering.com/blog/best-requirements-management-tools)

### Inferences
- Indicative annual cost for five editors on published prices: Flow Basic about USD 9,000 and Flow Pro about USD 18,000, but neither includes GovCloud/ITAR, which needs Enterprise; Altium Requirements Portal about USD 5,000. So the "ITAR-capable hosted" price floor among modern tools is a custom enterprise quote everywhere. A small CUI-handling shop has no cheap, published-price, compliant hosted option. This is my arithmetic from list prices, not a quoted figure.
- The realistic default for a 10-50 person subcontractor is probably Word and Excel inside a CMMC enclave (for example GCC High) rather than any RM tool. I found no data to prove this; TechCrunch's remark that engineers "often use Excel, Word, or Jira as workarounds" points the same way ([TechCrunch, 11 Mar 2024](https://techcrunch.com/2024/03/11/stell-raises-new-tranche-of-funding-to-keep-engineers-building-not-filling-out-paperwork/)). The main competitor for the founder is therefore Excel, not Stell.
- Among modern entrants, Flow is the better-funded and more visible threat for hardware startups, and it does list self-hosting; it deserves more worry than Stell for the "modern RM" position. Stell's distinct edge is the DoD authorisation stack.

### Gaps
- Innoslate: the brief says it is known for on-premises and government cloud. I could not confirm deployment options or price in this session (the pricing URL I tried returned 404). Needs a direct check of specinnovations.com.
- Trace.Space: no deployment or pricing information found.
- Jama air-gapped pricing, Visure price basis, Cameo/DOORS pricing: not found.
- No survey, forum thread or report found on which tools 10-50 person defence subcontractors actually buy or what they pay. This key question is unanswered.
- Requirements-quality tools (for example QVscribe, the Reuse Company) were not researched.

## 9. What small defence subcontractors need, and what Stell leaves unmet

### Takeaway
The regulatory facts support two paths for CUI: a cloud service that is FedRAMP Moderate authorised or equivalent, or software inside the contractor's own assessed boundary. Stell now fully serves the first path for US firms. It does not publicly serve the second (self-hosted, isolated networks), nor ReqIF/DOORS exchange with primes, nor non-US suppliers.

### Cited Findings
- DFARS 252.204-7012 requires a contractor using an external cloud provider for covered defense information to ensure the provider meets requirements equivalent to the FedRAMP Moderate baseline; a DoD CIO memo of 21 Dec 2023 defines equivalency as a 3PAO assessment showing 100% compliance with the Moderate baseline, with no open control POA&Ms (secondary summaries; memo itself not read) — [Crowell client alert](https://crowell.com/en/insights/client-alerts/no-longer-cloudy-dod-issues-new-guidance-on-fedramp-moderate-equivalency-cloud-security-requirements), [Summit 7](https://www.summit7.us/blog/fedramp-equivalency-memo), [Secureframe](https://secureframe.com/blog/fedramp-equivalency-cmmc)
- Under the CMMC rule (32 CFR 170), a contractor may use a cloud provider that is FedRAMP Moderate authorised or equivalent, and the contractor's own on-premises infrastructure connecting to it is in the assessment scope — [32 CFR 170.16, Cornell LII](https://www.law.cornell.edu/cfr/text/32/170.16)
- CMMC Level 2 flows down only to subcontractors that process, store or transmit CUI for that contract; subcontractors without CUI need only Level 1 self-assessment — [TrustedSec](https://trustedsec.com/blog/a-vault-with-no-treasure-cmmc-level-2-compliance-for-subcontractors-with-no-cui), [Morgan Lewis, Nov 2024](https://www.morganlewis.com/pubs/2024/11/dod-finalizes-cybersecurity-maturity-model-certification-program-requirements)
- Vendors' "FedRAMP equivalency" claims are sometimes made without a proper 3PAO assessment, so contractors are advised to check the body of evidence (vendor-authored warning from a competitor in secure file sharing) — [Kiteworks](https://www.kiteworks.com/regulatory-compliance/beware-fedramp-equivalency-claims/)
- [vendor, Oct 2026] Stell meets the cloud path: 3PAO-assessed FedRAMP Moderate Equivalency, CMMC L2, GovCloud — [24-7 Press Release](https://www.24-7pressrelease.com/press-release/539368/stell-engineering-achieves-fedramp-moderate-equivalency-for-its-requirements-management-platform)
- [vendor, 2026] Stell produces compliance matrices from customer PDFs/Word/Excel and tracks verification methods and evidence per requirement (the content of a VCRM) — [Stell product page](https://www.stell-engineering.com/product), [Stell Zelda page](https://www.stell-engineering.com/zelda)
- [vendor, 2026] Stell does not document ReqIF, DOORS import, export formats, or self-hosted deployment — [Stell product page](https://www.stell-engineering.com/product), [Stell blog, DOORS alternatives](https://stell-engineering.com/blog/ibm-doors-alternatives)

### Inferences
Needs Stell meets well (do not attack here):
- Turning a prime's PDF/Word/Excel spec into a compliance matrix quickly, with AI. This is Stell's best feature and the founder's tool has no equivalent.
- Verification method and evidence tracking per requirement (VCRM content).
- Holding CUI in a compliant cloud with no IT effort from the customer. For a shop with no IT staff, this beats self-hosting.
- A pre-loaded standards library.

Needs Stell does not publicly meet (candidate openings, each verifiable against Stell's public pages):
1. **Self-hosted, on-premises, air-gapped or classified-network use.** Not offered publicly. Any customer whose prime, contract or security officer forbids third-party cloud, or who works on an isolated network, cannot use Stell.
2. **Non-US suppliers.** GovCloud-only and US-person-only. Canadian, UK, EU, Australian and other allied subcontractors with data-sovereignty rules are not served.
3. **ReqIF and DOORS exchange with primes.** Undocumented. This is the standard exchange route with European and automotive-heritage primes and with DOORS shops.
4. **Formal configuration control:** named immutable baselines, per-item revision diff, deterministic suspect links, typed link rules. Undocumented; Stell offers AI comparison instead.
5. **Data ownership and exit:** closed source, undocumented export, 30-day retrieval window, fee changes on 30 days' notice. AGPL self-hosting answers all four.
6. **Price transparency and a no-sales-call start.** No price, trial or docs.
7. **Vendor survival risk.** A seed-stage company with no later round and heavy reliance on SBIR revenue; programmes last 10-30 years. Open source with self-hosting is a genuine answer to "what if the vendor disappears", though a solo founder has the same bus-factor problem and only the licence mitigates it.

Honest counterweights for the founder:
- Stell's weaknesses do not automatically become the founder's customers. The subcontractor with no IT staff is exactly the one least able to self-host; the opening is real mainly for firms that already run an on-prem enclave or have a security officer who says no to cloud.
- US DoD subcontractors will ask an unknown solo, possibly non-US, open-source vendor hard questions (supply chain, SBOM, FIPS crypto, who can commit code). Stell's "100% US-person team" line is aimed at exactly that fear.
- Stell could add ReqIF, export and baselines in a quarter if customers ask; those are not durable moats. Self-hosting, open source and non-US availability are structurally hard for Stell to copy because of its GovCloud/Bedrock architecture and authorisation boundary.
- The AI PDF-to-requirements import is becoming a baseline expectation in this segment (Stell, Flow, Trace.Space all lead with AI). An RM tool with only manual or CSV import will look dated to the same buyers.

### Gaps
- No primary evidence found on how often small subcontractors actually receive requirements as ReqIF/DOORS exports versus PDF/Word/Excel. Stell's PDF-first bet suggests PDF/Word dominates for its customers, which would weaken opening 3. Needs customer interviews.
- No evidence found on how many small subcontractors are required to work air-gapped versus allowed to use a FedRAMP-equivalent cloud. This decides how big opening 1 is.
- The DoD memo and CMMC rule were read only through secondary sources and one CFR section; confirm against the originals before relying on them.
