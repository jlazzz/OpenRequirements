# Scope expansion economics: RM-only vendors versus wider-scope vendors (test, risk, eQMS, ALM)

Research date: 2026-10-12. Every figure is dated. "Verified" means a primary source (company release, SEC or ASX filing). "Estimate" means an aggregator (Latka, Owler, Prospeo, Vendr, PitchBook profile) and should be treated as rough.

## 1. Market size and growth: RM versus ALM, eQMS and test management

### Takeaway
Analyst figures put RM at roughly $1.2B to $3.6B (2024-2025), ALM at $2.8B to $5.3B, life-sciences QMS software at $2.7B to $3.7B, and test management anywhere from $0.4B to $2.0B. The spread inside each category (up to 3x for RM, about 4x for test management) is as large as the gap between categories, so these numbers cannot support a scope decision on their own.

### Cited Findings
**Requirements management**
- Insight Partners: about US$1.38B in 2025, US$3.26B by 2034, CAGR 10.04% (2026-2034) — [The Insight Partners](https://www.theinsightpartners.com/reports/requirement-management-solution-market)
- Emergen Research: USD 1.24B in 2024, USD 3.18B by 2034 — [Emergen Research](https://www.emergenresearch.com/ar/industry-report/requirements-management-solution-market)
- MarketIntelo: $2.1B in 2025, $4.1B by 2034, CAGR 8.2% — [MarketIntelo](https://marketintelo.com/report/requirements-management-software-market)
- Wise Guy Reports: USD 2.64B in 2025, USD 5B by 2035, CAGR 6.6% — [Wise Guy Reports](https://www.wiseguyreports.com/reports/requirements-management-software-market)
- Market Research Future: $3.59B in 2025, $9.65B by 2035, CAGR 10.38% — [Market Research Future](https://www.marketresearchfuture.com/es/reports/requirements-management-solution-market-38124)

**ALM**
- MarketsandMarkets: USD 4.35B in 2024, USD 6.58B by 2029, CAGR 8.6% — [PR Newswire / MarketsandMarkets](https://prnewswire.co.uk/news-releases/application-lifecycle-management-market-worth-6-58-billion-by-2029--exclusive-report-by-marketsandmarkets-302431258.html)
- GMI: USD 4.6B in 2025, USD 16.1B by 2034, CAGR 14.8% — [Global Market Insights](https://www.gminsights.com/industry-analysis/application-lifecycle-management-market)
- IMARC: USD 2.8B in 2024, USD 5.1B by 2033 — [IMARC](https://www.imarcgroup.com/application-lifecycle-management-market)
- 360iResearch: USD 5.25B in 2025, USD 7.62B by 2030, CAGR 7.67% — [360iResearch via GII](https://www.giikorea.co.kr/report/ires1806262-application-lifecycle-management-market-by.html)

**Life sciences QMS software (eQMS)**
- Grand View Research: USD 3.7B in 2025, about USD 10.1B by 2033, CAGR 13.8%. Pharma is 56.4% of 2025 end-use, so medical devices are a minority of this number — [Grand View Research](https://www.grandviewresearch.com/industry-analysis/life-sciences-quality-management-software-market-report)
- Towards Healthcare: USD 2.74B in 2025, about USD 9.14B by 2035 — [Towards Healthcare](https://www.towardshealthcare.com/insights/life-sciences-quality-management-software-market-sizing)

**Test management software**
- SkyQuest: USD 1.75B in 2024, USD 2.04B in 2025, USD 6.91B by 2033, CAGR 16.5% — [SkyQuest via GII](https://www.giikorea.co.kr/report/sky1911861-test-management-software-market-size-share-growth.html)
- QYResearch: USD 444.8M in 2023, US$818.1M by 2030, CAGR 8.9% — [QYResearch via GII](https://www.giikorea.co.kr/report/qyr1415283-global-test-management-software-market-report.html)

### Inferences
- The reports are paid syndicated products with undisclosed methods. Two firms disagree by 2.6x to 2.9x on the same RM market in the same year, and by about 4x on test management. Treat every figure as an order of magnitude only.
- The categories overlap. ALM reports count RM and test management inside ALM. Jama, Polarion and Codebeamer revenue probably appears in both RM and ALM reports. Adding the categories together double-counts.
- The one usable signal: eQMS growth forecasts (about 13-14% CAGR) are consistently higher than RM forecasts (6.6-10.4%). But most eQMS spend is pharma, not devices.
- For a solo founder the total market is irrelevant. The reachable market is small medtech teams who will self-host an AGPL tool, which none of these reports sizes.

### Gaps
- No Gartner or Forrester market-size figure was found. Gartner does not publish a free RM market size.
- No report sizes "medical device design control software" or "small medtech RM" as a segment.
- Several figures were read from aggregator or non-English mirror pages (GII, MRF Spanish page), not the original report.

## 2. Company data: revenue, headcount, funding, acquisition price, customers

### Takeaway
The only disclosed large outcomes belong to vendors that sell more than RM: Jama ($1.2B, RM plus test and review), Codebeamer ($278M, full ALM), Greenlight Guru ($120M raised, QMS first). The pure-RM or near-pure-RM outcomes with a disclosed price are small: Valispace sold for $15.6M cash (about $20M with earn-out). Revenue is almost never disclosed, and aggregator estimates disagree by 2x to 5x.

### Cited Findings
**Wider scope, large outcomes**
- Jama Software: Francisco Partners signed a definitive agreement to acquire it for $1.2B, announced 2024-03-18, from Insight Partners, Madrona and others. The release cites "organic tripling of recurring revenue in 5 years". No ARR figure was disclosed — [Francisco Partners](https://www.franciscopartners.com/media/francisco-partners-to-acquire-jama-software-for-12b); [GeekWire](https://www.geekwire.com/2024/jama-software-acquired-for-1-2b-in-significant-exit-for-portland-based-company/)
- Commentary at the time noted Jama's turnover and ARR are not public — [SE-Trends](https://www.se-trends.de/en/jama-software-sold-for-usd-12-billion/)
- Jama spend estimate: Vendr lists a median contract of $61,455/year, from only 7 purchases, range $56,311 to $981,966 (estimate, tiny sample, checked 2026-10) — [Vendr](https://vendr.com/marketplace/jama-software)
- PTC / Intland (Codebeamer): announced April 2022 at about $280M. PTC's FY2023 10-K gives $278.1M net of cash acquired, closed 2022-04-29, financed with cash plus $264M of credit facility borrowing. Intland had about 150 employees at close (verified) — [PTC 10-K FY2023, SEC](https://www.sec.gov/Archives/edgar/data/857005/000095012323011049/Financial_Report.xlsx); [The Manufacturer](https://www.themanufacturer.com/articles/ptc-to-acquire-next-generation-intland-software-in-280m-deal/)
- Greenlight Guru: JMI Equity invested about $120M in June 2021. At that time: founded 2013, more than 500 medical device customers, 136 employees — [MassDevice](https://www.massdevice.com/jmi-equity-invests-120m-in-greenlight-guru/); [IBJ](https://www.ibj.com/articles/indy-based-software-firm-receives-120m-investment-to-foster-growth)
- Greenlight Guru later: "over 1,100 medical device companies" as of mid-2024; total funding listed as USD 121.3M (aggregator) — [Dialectica profile](https://www.dialectica.io/origin/company/greenlight-guru)
- Greenlight Guru headcount about 113 in 2026, and reported acquisitions of Ultralight Labs (2025-06-17) and Enzyme (2025-07-23). Aggregator data, not confirmed against a press release — [Unify headcount insights](https://www.unifygtm.com/insights-headcount/greenlight-guru)
- Qualio: $50M Series B led by Tiger Global with Menlo Ventures, May 2021. Founder said revenue rose more than 260% year on year; no dollar figure — [Fenwick](https://www.fenwick.com/insights/experience/fenwick-represents-qualio-in-50-million-series-b-financing); [Irish Times](https://www.irishtimes.com/business/technology/irish-founded-software-company-qualio-raises-50m-in-funding-1.4574746)
- Ketryx: $39M Series B announced early September 2025, led by Transformation Capital with Lightspeed, E14 Fund, Ubiquity and others. Total raised $57M per the company; CB Insights lists $57.05M over 5 rounds — [Ketryx](https://www.ketryx.com/blog/ketryx-raises-39m-series-b-from-transformation-lightspeed-to-scale-ai-in-medtech); [CB Insights](https://www.cbinsights.com/company/ketryx/financials)
- Matrix Requirements (now Matrix One): Lauxera Capital Partners took a majority stake for EUR 10M in June 2022. At that time: founded 2014, two products (MatrixALM and MatrixQMS), more than 180 medtech customers, average ARR growth 45% a year since inception. No ARR figure — [Lauxera](https://lauxera.com/lauxera-capital-partners-invests-e10m-in-german-medtech-software-company-matrix-requirements/)
- Matrix One now cites 300+ medical device companies and four products (Matrix Req, Matrix Quality, Matrix Connect, Matrix eIFU). No later transaction found — [Lauxera portfolio](https://lauxera.com/portfolio/matrix-one/); [Matrix One pricing page](https://matrixone.health/pricing)
- Enzyme (QMS): only seed rounds of $125k and $1.9M listed; founded 2017, South San Francisco — [Dealroom](https://app.dealroom.co/companies/enzyme)

**Test management vendors**
- TestRail (Gurock): acquired by IDERA, announced June 2016; price not disclosed. Now part of Sembi, an Idera subsidiary — [TestRail blog](https://www.testrail.com/blog/gurock-testrail-acquired-by-idera/); [TestRail about](https://www.testrail.com/about/)
- Xray (Xblend): acquired by Idera 2021-05-04; terms not disclosed. Release claims about 10 million Jira-based users reached (a reach claim, not paying seats) — [Business Wire](https://www.businesswire.com/news/home/20210504005205/en); [Idera](https://www.ideracorp.com/pressreleases/acquires-xblend)
- Qase: Series A August 2023, reported as $7.2M (MrWeb) or $6.7M (CB Insights), led by Chrome Capital — [MrWeb](https://www.mrweb.com/drno/news35552.htm); [CB Insights](https://www.cbinsights.com/company/qase/financials)
- Inflectra (SpiraTest / SpiraTeam / SpiraPlan): bootstrapped, founder owns 100%. Founder-reported $13M revenue in 2023, up from $10M in 2022, team of 55 (interview, October 2023) — [Latka founder interview](https://getlatka.com/interviews/inflectra-adam-sandman-2023)
- Inflectra later estimates conflict: Latka lists $20.4M for 2024; Prospeo $8.75M — [Latka](https://getlatka.com/companies/inflectra); [Prospeo](https://prospeo.io/c/inflectra-revenue)

**RM-only or RM-centred vendors**
- Valispace (requirements and systems engineering): acquired by Altium, announced February 2024. Upfront cash US$15.6M, plus deferred consideration of about $4.41M over three years tied to milestones, total about $19.97M — [Altium ASX half-year results](https://announcements.asx.com.au/asxpdf/20240227/pdf/060vg3c47dl0zj.pdf); [deutsche-startups](https://www.deutsche-startups.de/2024/02/27/dealmonitor-inkitt-valispace-sherpany/)
- Flow Engineering (requirements and systems engineering for hardware): $23M Series A led by Sequoia, announced 2025-10-14; earlier $8.5M seed led by EQT Ventures, December 2022 (seed figure from Sacra) — [Flow Engineering](https://flowengineering.com/blog/flow-raises-23m-from-sequoia-to-accelerate-the-future-of-hardware-development); [Fortune](https://fortune.com/2025/10/14/exclusive-flow-engineering-raises-23-million-series-a-led-by-sequoia-to-power-hardwares-new-era); [Sacra](https://sacra.com/c/flow-engineering/)
- Visure Solutions: estimates only. PitchBook lists 56 employees (2026). Owler says $5-25M revenue; Prospeo $7M; NeverBounce under $5M — [PitchBook](https://pitchbook.com/profiles/company/57085-66); [Owler](https://www.owler.com/company/visuresolutions); [Prospeo](https://prospeo.io/c/visure-solutions)
- Enalean (Tuleap, open-source ALM): Latka estimates $2.4M revenue in 2025 and 22 employees. A French business paper gave 20 staff in 2016 — [Latka](https://getlatka.com/companies/tuleap.org); [Le Journal des Entreprises](https://www.lejournaldesentreprises.com/article/alliance-entre-sogilis-et-enalean-56998)
- ReqView (Eccam s.r.o., Czechia): no revenue or headcount found. Pricing is public (see section 4) — [ReqView pricing](https://www.reqview.com/pricing/)

### Inferences
- Rough multiples. Codebeamer: $278M for about 150 staff is about $1.85M per employee. Valispace at about $20M is an order of magnitude below. Jama's $1.2B implies ARR somewhere near or above $100M at typical 2024 private-equity software multiples, but that is a guess; no ARR was disclosed.
- Tuleap is the closest precedent to the founder's model (open source, self-hostable, European, about 15 years old) and it has full ALM scope. If Latka is right, wide scope plus open source plus 15 years gives about $2.4M revenue and 22 people. Wide scope did not make it large.
- Inflectra is the best bootstrapped outcome found ($13M, 55 people, no investors) and it is test-management-first with ALM added, not RM-first.
- Venture money in 2025 went to RM-centred tools that pitch AI and a new buyer (Flow: hardware startups; Ketryx: software medtech compliance on top of Jira). Neither is "RM-only" in the old DOORS sense.

### Gaps
- No revenue, ARR or headcount found for Jama (beyond the "tripling" claim), IBM DOORS, Siemens Polarion, Codebeamer inside PTC, Helix ALM (Perforce), Orcanos, Aligned Elements or Cognition Corporation. IBM, Siemens and PTC do not break these products out. Searches for Orcanos, Aligned Elements and Cognition returned only unrelated companies.
- TestRail and Xray acquisition prices were never disclosed.
- Greenlight Guru and Qualio revenue: nothing reliable. No evidence found either way on layoffs.
- Greenlight Guru's acquisition of Enzyme (2025) rests on one aggregator page and needs a primary source.
- Not checked: PTC's later 10-Ks for Codebeamer ARR commentary, Altium filings for Valispace revenue at acquisition.

## 3. Which succeed as RM-only, and which bundled test, risk or QMS to grow

### Takeaway
No vendor found reached a large disclosed outcome on RM alone. Jama sells test management and review alongside requirements; Matrix sold ALM and QMS side by side from early on; Greenlight Guru started from QMS. The RM-only vendors that survive are small (ReqView, Requirement Yogi) or were bought cheaply as a feature (Valispace).

### Cited Findings
- Jama Connect includes a Test Center: testers run test cases, log defects from a failed step, and the defect links to a Jira issue. Jama describes a test management module with test plans, test cases, dashboards and reports — [Jama Jira integration datasheet](https://www.jamasoftware.com/media/2023/12/jama-connect-integration-jira-datasheet.pdf); [Jama Connect datasheet](https://www.jamasoftware.com/media/2023/12/jama-connect.pdf)
- Matrix Requirements in 2022 already had two products: MatrixALM (medical device technical file) and MatrixQMS — [Lauxera](https://lauxera.com/lauxera-capital-partners-invests-e10m-in-german-medtech-software-company-matrix-requirements/)
- Matrix One today lists risk management as a feature of both Matrix Req and Matrix Quality, with e-signatures as a platform capability for 21 CFR Part 11 — [Matrix One pricing](https://matrixone.health/pricing)
- Greenlight Guru was described in 2021 as medical device quality management software — [MassDevice](https://www.massdevice.com/jmi-equity-invests-120m-in-greenlight-guru/)
- Intland described Codebeamer as an Application Lifecycle Management family, not RM — [PTC 10-K FY2023](https://www.sec.gov/Archives/edgar/data/857005/000095012323011049/Financial_Report.xlsx)
- Polarion is sold as separate REQUIREMENTS, QA and ALM products on one platform; minimum-seat rules can be met by mixing them — [TechTarget](https://www.techtarget.com/searchsoftwarequality/feature/Polarion-Software-offers-ALM-focused-on-regulatory-compliance)
- Valispace was absorbed into Altium as "Requirements Portal", now inside Altium Develop: RM became a feature of a design suite — [Valispace](https://www.valispace.com/pricing/)
- Ketryx positions on top of Jira and other tools, maintaining a live traceability matrix across connected systems, not as a standalone RM database — [Ketryx](https://llm.ketryx.com/content/blog/iec-62304-requirements-traceability-matrix-rtm-in-jira-a-guide-for-medical-device-companies.md)

### Inferences
- The pattern in medtech is "RM plus risk plus test plus e-signature in one validated tool" as the minimum design-control product (Matrix Req, Greenlight Guru's design control, Jama's medical device configuration). Buyers buy a design history file, not a requirements database.
- QMS is usually a second product with its own name and price (MatrixQMS / Matrix Quality), not a module of the RM tool. That suggests a different buyer (quality manager, not engineering lead) and a different sales motion.
- RM-only survives where it is cheap and attaches to something else: ReqView to Git, Requirement Yogi to Confluence, Valispace to Altium.

### Gaps
- When Jama added test management and Review Center was not established from a dated source.
- Whether Greenlight Guru's first product was document control or design control was not confirmed from a primary source.
- No data on attach rates (what share of RM customers also buy test or QMS).

## 4. Price uplift: RM alone versus ALM or eQMS bundles, and add-on module prices

### Takeaway
Hard per-module prices are scarce because the medtech vendors quote privately. The usable evidence: RM-only tools list at about EUR 440-600 per user per year (ReqView), while medtech eQMS and design-control suites are sold as platform contracts of roughly $15k-$60k per year for small teams. The uplift is real but comes mostly from moving to a platform fee and a compliance buyer, not from a per-seat module surcharge.

### Cited Findings
- ReqView (RM-only): PRO EUR 440/user/year, TEAM EUR 600/user/year (adds Jira, Azure DevOps, ReqIF integrations), ENTERPRISE EUR 1,800 per floating client per year with a 3-client minimum (EUR 5,400). Free tier limited to 1 document and 150 objects (checked 2026-10) — [ReqView pricing](https://www.reqview.com/pricing/)
- Polarion (dated article, year not shown): named on-premises licence $2,490, concurrent $8,690, support from 20% a year; SaaS named user $1,788 for 12 months with a 10-user minimum — [TechTarget](https://www.techtarget.com/searchsoftwarequality/feature/Polarion-Software-offers-ALM-focused-on-regulatory-compliance)
- Jama: no list price. Vendr median contract $61,455/year from 7 purchases (estimate) — [Vendr](https://vendr.com/marketplace/jama-software); G2 confirms no published pricing — [G2](https://www.g2.com/products/jama-connect/pricing)
- Greenlight Guru: no list price. Customer-reported $25k-$35k/year for 5-10 person startups with a few seats; another site gives about $15k/year entry rising to $50k-$60k. Onboarding services are mandatory and extra. A reported median annual spend of about $44k (range about $21k-$55k) is attributed to Vendr data. One source reports price rises approaching 100% from 2026 (unverified) — [OpenRegulatory](https://openregulatory.com/articles/greenlight-guru-price); [ERP Research](https://erpresearch.com/erp-add-ons/healthcare/greenlight-guru/pricing)
- Qualio: estimated base platform fee about $12,000/year plus about $3,000 per user; another estimate puts the entry tier near EUR 25,000/year (not vendor-confirmed) — [ERP Research](https://erpresearch.com/erp-add-ons/healthcare/qualio/pricing)
- Matrix One: no tiers published; "we do not sell generic tiers". Annual subscriptions, "no hidden fees or per-feature add-ons", read-only users free on most plans, customers can start with one product and add others — [Matrix One pricing](https://matrixone.health/pricing)
- A competitor claims Polarion often needs add-on licences and is generally more expensive (vendor claim) — [Inflectra comparison](https://inflectra.com/Products/Comparison/SpiraPlan-vs-Polarion.aspx)

### Inferences
- A 5-person medtech team on ReqView TEAM pays about EUR 3,000/year. The same team on Greenlight Guru reportedly pays $25k-$35k. That is roughly an 8x to 12x difference in contract value. It is not a like-for-like comparison: the higher price buys a validated, hosted, audited eQMS with onboarding, and the vendor carries sales and compliance cost to earn it.
- Matrix One's "no per-feature add-ons" statement means risk and test are inside the base design-control price in the nearest medtech competitor. A new entrant cannot easily charge extra for a risk module when the reference product includes it. Risk and test are table stakes for a higher base price, not upsells.
- The separate price is at the product level: QMS is a second product with a second contract.

### Gaps
- No per-module price was found for risk, test or e-signature add-ons at any vendor.
- Inflectra's public price list (SpiraTest versus SpiraTeam versus SpiraPlan), which would give a clean test-only versus ALM uplift, could not be fetched (404). Worth a manual check.
- Codebeamer, Helix ALM, Visure, Orcanos and Aligned Elements prices were not found.
- The Polarion prices are undated and likely old.

## 5. Which adjacent module is closest to RM and gives most revenue per unit of build effort for medtech

### Takeaway
Little direct evidence exists on build cost; this section is mostly inference from product structure. The product evidence says risk management and verification tests sit inside the design-control product at the nearest medtech competitors, while QMS is a separate product. Regulatory guidance treats QMS software and device-development records differently, which supports keeping eQMS out of scope.

### Cited Findings
- Matrix One places risk management inside Matrix Req (design control) and offers e-signatures as a platform capability for 21 CFR Part 11 — [Matrix One pricing](https://matrixone.health/pricing)
- Matrix's original split was ALM (technical file) versus QMS as two products — [Lauxera](https://lauxera.com/lauxera-capital-partners-invests-e10m-in-german-medtech-software-company-matrix-requirements/)
- Jama keeps test cases, test runs and defects as linked items in the same relationship model as requirements — [Jama Jira integration datasheet](https://www.jamasoftware.com/media/2023/12/jama-connect-integration-jira-datasheet.pdf)
- FDA's general software validation principles expect traceability from requirements through design and testing; the expectation is on the links between artefacts — [MD+DI](https://www.mddionline.com/automation/software-implementing-an-automated-traceability-mechanism-for-medical-device-software)
- FDA's Computer Software Assurance guidance applies to software used in production and quality systems (for example a CAPA or document system), not to device software functions. Assurance effort should match risk, and manufacturers may lean on vendor assessments and certifications such as ISO 13485 — [Hogan Lovells](https://www.hoganlovells.com/en/publications/fda-finalizes-computer-software-assurance-guidance-for-production-and-quality-system-software)
- Greenlight Guru requires paid onboarding and implementation services for every new customer, a sign of the service load an eQMS carries — [OpenRegulatory](https://openregulatory.com/articles/greenlight-guru-price)

### Inferences
Ranking by fit to an existing RM data model (items, typed attributes, links, revisions, baselines), cheapest first. These are judgements, not sourced facts.

1. **Design reviews with e-signatures.** Smallest build: a review is a baseline plus approvals and signature records. It needs audit trail, signature meaning and re-authentication for Part 11. It is also a purchase blocker: without it a regulated team cannot use the tool as the record. Low ongoing regulatory maintenance, because Part 11 is stable.
2. **Risk management (ISO 14971 hazard analysis / FMEA).** A risk is an item type with computed fields (severity x probability, before and after controls) and links to requirements as risk controls. Mostly configuration plus a risk-matrix view. Maintenance burden is moderate: ISO 14971 changes rarely, but customers each want their own scoring scheme.
3. **Verification test cases and test runs.** Test cases are another item type, cheap. Test runs are not: they are execution records with per-step results, evidence attachments and a signed outcome, and they multiply data volume. A minimal version (test case plus manually recorded result plus link) is cheap and closes the traceability matrix. A full TestRail-style runner is a product in itself.
4. **Document control / eQMS (CAPA, training, complaints, supplier management).** Furthest from the RM model. Different buyer, different workflows (training records per person, complaint intake, CAPA state machines), heavier validation expectations because the tool is the quality system, and mandatory onboarding. Competes directly with funded vendors (Greenlight Guru $120M, Qualio $50M+).

- Revenue per unit of effort: 1, 2 and minimal 3 do not obviously add a price line (competitors bundle them), but they convert the product from "nice RM tool" to "can hold the design history file". They raise win rate and base price, not seat add-on revenue.
- eQMS is the only one that plausibly adds a second contract, and it is the one a solo founder is least able to build, validate and support.
- CLAUDE.md already schedules reviews, approvals and signatures for Phase 3. The evidence here suggests that is the most valuable of the adjacent pieces for medtech and could be pulled earlier.

### Gaps
- No source gives engineering effort or maintenance cost per module. No vendor publishes it.
- No source quantifies which module drives purchase decisions in small medtech. Customer interviews would answer this better than desk research.
- ISO 14971, IEC 62304 and Part 11 requirements were not read directly in this pass.

## 6. Integrate versus build: Jira, TestRail, Xray, Qase, GitHub/GitLab, and whether regulated buyers accept it

### Takeaway
Integration with Jira is standard and accepted: Jama's own recommended pattern keeps Jira separate and syncs. Regulators care that links exist and can be shown, not which tool holds them. But vendors that sell single-system traceability describe multi-tool chains as error-prone, and no primary FDA source was found on how auditors judge a federated toolchain.

### Cited Findings
- Jama Connect Interchange syncs Jama and Jira bidirectionally, configured without scripting, at intervals from 15 seconds to 24 hours; supports cloud, self-hosted and air-gapped installs and Jira Data Center 8.13+ — [Jama blog](https://www.jamasoftware.com/blog/jama-connect-features-in-five-jama-connect-interchange-what-sets-us-apart/); [Jama support](https://support.jamasoftware.com/hc/en-us/articles/23265994479245)
- Jama recommends syncing only 2-3 core Jira issue types (epics, stories, tasks) and not replicating whole datasets across tools — [Jama support](https://support.jamasoftware.com/hc/en-us/articles/23265994479245)
- Jama's pitch is "Live Traceability across a best-of-breed toolchain including Jira", and lists a medical device approach as a typical integration pattern — [Jama Jira integration datasheet](https://www.jamasoftware.com/media/2023/12/jama-connect-integration-jira-datasheet.pdf)
- ReqView puts Jira, Azure DevOps, Sparx EA and ReqIF integration in its higher TEAM tier (EUR 600 versus EUR 440): integration is itself a paid differentiator — [ReqView pricing](https://www.reqview.com/pricing/)
- Vendor claim: Jira has no native mechanism for generating the evidence FDA expects, especially the requirements traceability matrix; teams fall back on copying into spreadsheets, which causes version errors — [Ketryx](https://llm.ketryx.com/content/blog/iec-62304-requirements-traceability-matrix-rtm-in-jira-a-guide-for-medical-device-companies.md)
- Ketryx's product answer is to keep teams in Jira and maintain a live traceability matrix across connected systems; it raised $39M on that approach in 2025 — [Ketryx](https://www.ketryx.com/blog/ketryx-raises-39m-series-b-from-transformation-lightspeed-to-scale-ai-in-medtech)
- User-reported integration risk: moving a Jama item between projects changed its global ID and broke links — [AWS Marketplace review](https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-osvck3o74t6k6?page=19)
- FDA traceability expectation is that requirements can be traced through the development documents; it does not name a tool — [MD+DI](https://www.mddionline.com/automation/software-implementing-an-automated-traceability-mechanism-for-medical-device-software)

### Inferences
- "Integrate with external test tools" is acceptable to regulated buyers only if the RM tool can still produce the full trace matrix (requirement to test case to result) as a frozen, signed record. A hyperlink to a TestRail run is not enough: the result and its revision must be captured at baseline time.
- That implies a middle path: do not build a test runner, but store an imported, immutable test-result record (id, verdict, date, source URL, revision) as an item linked to the requirement. This fits the existing "External reference" concept in the project glossary and closes the gap cheaply.
- Each integration is permanent maintenance. Jira Cloud, Jira Data Center, Xray, TestRail, Qase, GitHub and GitLab are seven APIs that change. For a solo founder, two or three integrations plus a generic import (CSV, JUnit XML, ReqIF) is the realistic ceiling.
- Ketryx's funding shows investors believe the opposite bet too: stay inside Jira and add compliance. That is a direct competitor to "standalone RM plus integrations" for software-heavy medtech teams.

### Gaps
- No documented native integration between RM vendors and TestRail, Xray or Qase was found in this pass, and nothing on GitHub/GitLab integrations.
- No primary FDA or notified-body statement on multi-tool traceability, and no audit-finding data (for example 483 observations) attributed to toolchain gaps.
- All "Jira is a gap" statements come from vendors that sell the fix.

## 7. Bootstrapped and solo-founder precedents

### Takeaway
Bootstrapped RM-only businesses exist and persist for a decade or more, but the evidence found puts them at single-digit headcount with undisclosed, probably low-single-digit-million or smaller revenue. The largest bootstrapped precedent found (Inflectra, $13M in 2023) is test management plus ALM. The closest open-source precedent (Tuleap) has full ALM scope and an estimated $2.4M.

### Cited Findings
- Inflectra: no outside investment, founder owns 100%, $10M (2022) and $13M (2023) revenue, 55 staff, three products spanning test management to ALM and program management (founder-reported, October 2023) — [Latka founder interview](https://getlatka.com/interviews/inflectra-adam-sandman-2023)
- Enalean / Tuleap (open-source ALM): estimated $2.4M revenue in 2025, 22 employees (Latka estimate); 20 staff in 2016 — [Latka](https://getlatka.com/companies/tuleap.org); [Le Journal des Entreprises](https://www.lejournaldesentreprises.com/article/alliance-entre-sogilis-et-enalean-56998)
- Requirement Yogi (RM for Confluence): about 1,540-1,560 installs on Atlassian Marketplace (2026 listing); the company describes itself as a start-up of 5 people, elsewhere "10+" and "after several years as a team of three"; founded 2013; claims 330,000+ users — [Atlassian Marketplace](https://marketplace.atlassian.com/apps/1212523/requirement-yogi-requirements-management-for-confluence); [Requirement Yogi about](https://www.requirementyogi.com/about/); [Cake profile](https://www.cake.me/companies/requirement-yogi?locale=ja)
- ReqView: RM-only desktop and web tool from Eccam s.r.o. (Czechia), EUR 440-600 per user per year, 49 Capterra reviews rated 4.6 — [ReqView pricing](https://www.reqview.com/pricing/); [Capterra](https://www.capterra.com/p/145388/ReqView/pricing/)
- Matrix Requirements: founded 2014, reached 180+ medtech customers by 2022, then sold a majority stake for EUR 10M — [Lauxera](https://lauxera.com/lauxera-capital-partners-invests-e10m-in-german-medtech-software-company-matrix-requirements/)

### Inferences
- Matrix Requirements is the most relevant precedent: small European team, medtech only, eight years to 180 customers, EUR 10M for a majority stake. That implies an enterprise value probably under EUR 20M, on a product that already included ALM, risk, test and a QMS. It is a good outcome for founders and a realistic ceiling for this niche without venture money.
- Scope and outcome correlate, but so do age, sales headcount and funding. The data cannot separate "wider scope caused growth" from "companies that grew could afford wider scope".
- Sceptical answer to the founder's question. Expanding scope does not by itself improve profitability; it raises the price ceiling per customer and the support, validation and sales cost at the same time. The evidence supports a narrow expansion: add what makes the tool a complete design-control record for medtech (e-signed reviews, risk items linked to requirements, minimal test results), because competitors bundle those and buyers expect them. It does not support building eQMS or a full ALM, where funded incumbents with $50M-$120M raised already compete and where Tuleap shows wide open-source scope still yields a small business.
- AGPL self-hosting removes the hosted-platform fee that most of the price uplift in section 4 comes from. Revenue would have to come from a hosted edition, validation packs, support contracts or a commercial licence. None of the precedents found is an AGPL medtech tool, so there is no comparable to price against.

### Gaps
- No revenue found for ReqView / Eccam, Requirement Yogi or Doc Sheets. Doc Sheets was not researched. No Indie Hackers or podcast source on a solo RM founder was found.
- Czech and French company registers (Eccam s.r.o., Requirement Yogi SAS, Enalean SAS) publish filed accounts and would give real revenue; not checked.
- Atlassian Marketplace install counts do not convert to revenue without seat sizes.
- No precedent found for a solo-founder, open-source, medtech-specific RM tool, successful or failed.
