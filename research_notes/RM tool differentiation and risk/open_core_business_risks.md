# Business risks: solo-founder, open-core (AGPL + CLA) requirements management tool for medical device teams (as of 2025-2026)

Researcher's note on evidence quality: every cited finding below comes from web search result summaries retrieved on 2026-10-12. I did not open the full pages, so quotes and figures should be checked against the linked source before they go into a final report. Several sources are vendor blogs or data aggregators; these are marked. Where I found nothing reliable, it is listed under Gaps and not estimated.

## 1. Open-core economics: conversion rates, comparable companies, what sits behind the paywall

### Takeaway
There is no reliable published free-to-paid conversion rate for self-hosted open-source B2B tools; the numbers in circulation are unverified and contradict each other. The comparable companies that publish revenue took years and a team to reach low single-digit millions, and the closest analogue (Tuleap/Enalean) is roughly $2.4M revenue with about 22 staff after well over a decade.

### Cited Findings
- Conversion benchmarks conflict and are unverified. One blog attributes 15-25% free-to-paid for "well-executed" open core to an OpenView 2022 report (vs 2-5% for typical freemium); another from the same publisher attributes 2-5% (broad developer tools), 5-10% (specialised infrastructure) and 15-20% (enterprise-focused) to Bessemer. Neither original report could be opened. Treat as unverified marketing-blog figures. — [Monetizely: open source adoption and SaaS revenue](https://www.getmonetizely.com/articles/whats-the-relationship-between-open-source-adoption-and-saas-revenue); [Monetizely: is your community cannibalizing revenue](https://www.getmonetizely.com/articles/is-your-open-source-community-cannibalizing-your-saas-revenue-a-strategic-analysis)
- Qualitative pattern (analysis, not data): popularity arrives long before willingness to pay; paid conversion starts when a team needs SSO, governance and support. — [Sacra: Refine's shift to enterprise monetization](https://sacra.com/chat/h/e5a36e72-aa77-4b99-afbd-2cac0f2dfe7a/)
- Plausible Analytics (AGPL, bootstrapped): crossed $1M ARR in 2022 with a team of four; about $3.1M ARR reported by late 2024; its own about page (undated) says a team of 10. Launched 2019, so roughly 3 years to $1M ARR with two founders, in a horizontal market (every website owner), not a niche vertical. — [Indie Hackers: $1M ARR milestone](https://www.indiehackers.com/post/we-just-reached-the-1m-arr-milestone-32722fc93e); [Tiny Empires: Plausible Analytics](https://tinyempires.substack.com/p/inside-a-tiny-empire-plausible-analytics)
- Plausible went from $400 to $22k MRR in one year (founder AMA). This is an outlier success story and a horizontal product. — [Indie Hackers AMA](https://www.indiehackers.com/post/from-400-to-22k-mrr-in-one-year-with-plausible-a-google-analytics-alternative-ama-776a4803b7)
- Cal.com (AGPL, VC-backed): $32.4M raised (seed $7.4M 2021, Series A $25M April 2022). Third-party estimates: ARR $2.9M end of 2024, $6.2M end of 2025, $10M in July 2026; about 60% of recurring revenue estimated to come from enterprise contracts. Latka gives a conflicting $5.1M for 2024 revenue. — [Sacra: Cal.com](https://sacra.com/c/cal); [Latka: Cal.com](https://getlatka.com/companies/calcom)
- Documenso (AGPL, e-signature, about $1.3M pre-seed in 2023): 2025 review reports just over 340 paying customers and more than 34k users. It publishes growth rates but not absolute revenue. 340 paying of 34k users is about 1% (my arithmetic; "users" likely mixes cloud free accounts, so this is a rough indicator only). — [Documenso: 2025 A Year in Review](https://documenso.com/blog/2025-a-year-in-review); [Documenso: 2024 review](https://documenso.com/blog/2024-review); [VCBacked: Documenso](https://www.vcbacked.co/company/documenso)
- Tuleap / Enalean (open-source ALM with requirements and traceability; the closest product analogue): third-party estimate of about $2.4M revenue in 2025 and 22 employees (July 2025). A 2016 French business article already listed 20 employees, i.e. headcount roughly flat for about a decade. Aggregator estimate, not audited. — [Latka: Tuleap/Enalean](https://getlatka.com/companies/tuleap.org); [Le Journal des Entreprises, 2016](https://www.lejournaldesentreprises.com/article/alliance-entre-sogilis-et-enalean-56998)
- OpenProject GmbH (founded 2012, Berlin): aggregator revenue estimates from about $4.4M to $5.6M, with one outlier band of $10-50M; headcount estimates 20 to 100. Low confidence. — [RocketReach: OpenProject](https://rocketreach.co/openproject-open-source-project-management-software-profile_b47a9b70fc465def); [Highperformr: OpenProject GmbH](https://www.highperformr.ai/company/openproject-gmbh)
- Docmost: no verifiable revenue; bootstrapped; funded by selling an enterprise edition under a custom non-FOSS licence. — [Is it really FOSS: Docmost](https://isitreallyfoss.com/projects/docmost/)
- SSO as a paywall: an analysis of 5,191 SaaS tools found that of 1,112 offering SSO, 61% put it only in the most expensive tier. — [Toolradar: SaaS feature paywall 2026](https://toolradar.com/reports/saas-feature-paywall-2026)
- Criticism of the "SSO tax": SSO is argued to be a baseline security control, not a luxury; gating it forces smaller companies into a weaker security posture. The sso.tax "wall of shame" has tracked this since 2018, and the same criticism is now aimed at self-hosted open-core projects. — [Kolide: backlash to the SSO tax](https://k2.kolide.com/blog/explaining-the-backlash-to-the-sso-tax); [Is it really FOSS: SSO tax](https://isitreallyfoss.com/concerns/sso-tax); [SSD Nodes: SSO tax in self-hosted apps](https://www.ssdnodes.com/learn/the-sso-tax-in-self-hosted-apps)
- Counter-view from an SSO vendor founder: the SSO tax is unpopular but defensible as price discrimination. — [SSOReady: an unpopular perspective on the SSO tax](https://ssoready.com/blog/from-the-founders/an-unpopular-perspective-on-the-sso-tax)
- GitLab: instance-wide SAML SSO for self-managed is listed for Free, Premium and Ultimate; group-level SAML features sit in Premium. So even the reference open-core company does not gate basic SSO on self-managed. — [GitLab docs: SAML SSO for self-managed](https://docs.gitlab.com/integration/saml)
- Some projects (e.g. Postiz) ship the whole product free to self-host and charge only for hosting, with no SSO or enterprise locks. Single anecdote. — [Monetizely: what to gate in open core](https://www.getmonetizely.com/articles/what-features-should-you-gate-in-your-open-core-product)

### Inferences
- Base rate from comparables: the companies that reached $1M+ ARR had (a) two or more people, (b) either a horizontal market or venture funding, and (c) three or more years. None is a solo founder in a regulated vertical. I found no example of a solo-founder open-core company selling to regulated industries with published revenue.
- Enalean is the most relevant warning: a competent, long-lived open-source RM/ALM vendor with EU regulated-industry customers appears to have plateaued at roughly 20 people and low single-digit millions. That suggests the niche supports a small company, not a fast-growing one.
- Conversion planning: with no reliable number, a cautious plan should assume low single-digit percent of active self-hosted installs convert, and that conversion is driven by a compliance or procurement trigger, not by usage volume.
- SSO behind the paywall is the industry norm (61%) but draws vocal criticism and is not what GitLab does for basic self-managed SSO. For a security-conscious regulated buyer, gating SSO at the $10k tier is defensible commercially but will be called out.

### Gaps
- No primary-source conversion rate for self-hosted open-core B2B. The OpenView and Bessemer reports cited by secondary blogs were not verified.
- No revenue data found for Kanboard, Taiga, Zammad, BookStack, Outline, Odoo's early years or Mattermost in this pass (not searched individually for lack of tool budget).
- GitLab's "buyer-based open core" tiering rationale (feature goes to the tier of the buyer who cares most) was not retrieved from the GitLab handbook in this pass; it is well known but uncited here.
- Open Core Ventures, OSS Capital, a16z, Bessemer and Heavybit essays were not retrieved beyond one OCV post on AGPL.

## 2. AGPL effects, CLA effects, and licence-change backlash

### Takeaway
AGPL is on many corporate "stop" lists, which mostly means extra approval rather than an outright ban, but it does add friction to exactly the self-hosted adoption path the plan relies on. The CLA is what makes a commercial enterprise licence possible; the evidence that CLAs deter contributors is weak, and in practice single-vendor projects get few outside contributions regardless.

### Cited Findings
- Google's public policy states AGPL-licensed code "MUST NOT be used at Google", including installation on workstations without explicit approval, because of the network-use clause. It adds that alternative licences may be available in some cases. — [Google: AGPL Policy](https://opensource.google/docs/using/agpl-policy/)
- A leading open-source lawyer notes many companies put AGPL on a "stop" list because they doubt their internal controls; a stop listing means ad hoc human approval is required, not an absolute ban. — [Heather Meeker: AGPL in the Light of Day (2023)](https://heathermeeker.com/2023/10/13/agpl-in-the-light-of-day/)
- Open Core Ventures (investor opinion): "AGPL license is a non-starter for most companies." — [Open Core Ventures](https://www.opencoreventures.com/blog/agpl-license-is-a-non-starter-for-most-companies)
- Relicensing outcomes, independent case study of four relicensed projects (Kibana, Schema Registry, MongoDB, Terraform): activity was mostly stable or modestly declining afterward, and vendor employees made the majority of commits both before and after. For Terraform, only two non-HashiCorp contributors were active in the year before and after. — [The New Stack: what happens to relicensed projects and their forks](https://thenewstack.io/what-happens-to-relicensed-open-source-projects-and-their-forks/)
- Forks follow relicensing when large companies depend on the project: OpenTofu (Terraform) launched within weeks under the Linux Foundation; AWS forked Elasticsearch as OpenSearch (2021); Valkey forked Redis. Redis moved Redis 8 to AGPLv3 in May 2025, a partial return to open source. — [The New Stack](https://thenewstack.io/what-happens-to-relicensed-open-source-projects-and-their-forks/); [InfoWorld: Redis bets big on an open source return](https://infoworld.com/article/3975620/redis-bets-big-on-an-open-source-return.html)
- Academic work on contributor agreements is qualitative and does not measure contributor drop-off. — [OpenSym: licensing and other conditions for contributing](https://opensym.org/blog/2019/11/14/on-licensing-and-other-conditions-for-contributing-to-widely-used-open-source-projects-an-exploratory-analysis-2/)

### Inferences
- For a self-hosted web application used as an internal tool (not embedded in the customer's product, not modified), AGPL obligations are light. The risk is procedural: the customer's legal or IT policy blocks it by default and someone has to ask for an exception. In a small medtech company there may be no policy at all; in a mid-size or large one there usually is. So AGPL filters out part of the larger-customer segment from the free edition, which is arguably what pushes them to the paid commercial licence, but it also adds a sales objection.
- AGPL does deter a cloud provider from offering a closed, modified hosted version. It does not stop anyone hosting the unmodified AGPL edition and selling that service. At this project's scale, hyperscaler competition is not a realistic threat anyway; a consultancy offering "managed open requirements tool" is more plausible, and AGPL allows it.
- The relicensing backlash cases all involve large projects with large dependent ecosystems. The lesson for a small project is narrower: decide the licence and the open/paid boundary once, publish it, and do not move features from free to paid later. A CLA makes relicensing possible, and informed contributors know that, which is why it reads as a warning sign to some.
- Expect near-zero outside code contributions either way (Terraform had two outside contributors at vastly larger scale). The CLA's cost in lost contributions is therefore small in absolute terms; "community" should not be counted as free engineering in the plan.

### Gaps
- No survey data found on what share of enterprises or regulated companies ban or restrict AGPL (FOSSA, Snyk or Black Duck licence reports were not retrieved).
- No data specific to medical device manufacturers' open-source policies for internal tools.
- No quantitative study found on CLA adoption and contribution rates.
- Hacker News threads were not retrieved.

## 3. Is gating compliance features compatible with an all-regulated buyer base?

### Takeaway
This is the central design tension and I found no direct evidence on it, only adjacent facts. Every target buyer needs audit trail and controlled review/approval to use the tool for design controls at all, so gating them makes the free edition a trial rather than a usable product for the target market; not gating them leaves little reason to pay.

### Cited Findings
- Under ISO 13485 clause 7.4, and from 2 February 2026 under FDA's QMSR which incorporates ISO 13485:2016 by reference, purchasing controls on suppliers have the force of US federal law and supplier records can be inspected. — [MedDeviceGuide: supplier audit checklist ISO 13485 / QMSR](https://meddeviceguide.com/blog/supplier-audit-checklist-medical-device-iso-13485-qmsr-critical-suppliers)
- Incumbent pricing for a small team is high relative to the planned price: Matrix Requirements Team plan about 610 EUR/month for 3 seats (December 2024), Company plan 920 EUR/month; Greenlight Guru reported at roughly $25k-35k/year for small startups with a few seats, with a mandatory onboarding fee and validation package. Source is a competitor's blog (OpenRegulatory); directional only. — [OpenRegulatory: Matrix Requirements pricing](https://openregulatory.com/articles/matrix-requirements-pricing); [OpenRegulatory: Greenlight Guru price](https://openregulatory.com/articles/greenlight-guru-price)
- Open-core projects typically justify gated features as "needed by enterprise users who can pay"; critics note these features are increasingly needed by small organisations too. — [Is it really FOSS: SSO tax](https://isitreallyfoss.com/concerns/sso-tax)

### Inferences
- Three coherent positions exist, each with a cost:
  1. Gate audit trail, e-signatures and approvals. The free edition is then unusable for regulated design-control records. It works as a demo, and for unregulated or pre-regulatory teams. Community growth in the target market will be weak, and the "open source" claim invites criticism.
  2. Ship audit trail and versioning free (the project's hard rules already make history append-only and audit every write), and gate Part 11 e-signatures, formal review/approval workflow, SSO and the validation pack. The free edition is then genuinely usable by a small team that signs off outside the tool (PDF export plus an external e-signature or its eQMS). This is the more defensible boundary, but a frugal startup can stay free indefinitely.
  3. Gate nothing in code; sell hosting, the validation pack, support and a commercial non-AGPL licence. Maximum goodwill, weakest pricing power for self-hosters.
- The validation pack (IQ/OQ documentation, test evidence, release notes per version) is probably the most natural paid item: it is not code, it costs real recurring effort to produce, regulated buyers need computerized system validation evidence (ISO 13485 clause 4.1.6), and it cannot be forked for free. It also ties revenue to something a solo founder must redo for every release, which is a workload risk.
- The planned $10k/year enterprise self-hosted price is at or below what incumbents charge a three-seat startup (Matrix about 7.3k-11k EUR/year; Greenlight Guru $25k+). The paid tier is not "too expensive to try". The risk is the opposite: the cloud tier at $30-40 per editor is so far below market that it may signal immaturity to a QA/RA buyer and leaves little margin to fund compliance costs.

### Gaps
- No evidence found on how other open-source tools aimed at regulated users (e.g. OpenRegulatory's Formwork, open-source eQMS/LIMS projects) set this boundary or how it affected adoption.
- No data on what proportion of small medtech teams would accept signing off outside the RM tool.
- 21 CFR Part 11 and ISO 13485 4.1.6 requirements are stated from general knowledge here, not from a retrieved source.

## 4. Solo-founder risk in regulated B2B: supplier qualification, security, continuity, liability

### Takeaway
A one-person vendor is not disqualified by ISO 13485, because supplier control is risk-based, but it will be questioned on continuity and security at every deal above the smallest customers. Open source plus self-hosting is a real answer to the continuity objection (stronger than escrow), but it does not answer the "who supports and validates it" objection.

### Cited Findings
- ISO 13485 clause 7.4 requires criteria for supplier selection, evaluation, monitoring and re-evaluation, proportionate to the risk the purchased product poses to the device. — [MedDeviceGuide](https://meddeviceguide.com/blog/supplier-audit-checklist-medical-device-iso-13485-qmsr-critical-suppliers)
- Audits are not required for every supplier; a supplier that writes the device's software and is not ISO 13485 certified would need a supplier audit, while low-risk suppliers do not. — [Johner Institute: supplier evaluation and audits](https://blog.johner-institute.com/quality-management-iso-13485/supplier-evaluation-supplier-selection-supplier-audits/)
- QMSR took effect 2 February 2026; FDA inspectors can now review supplier audit records. FDA section 524B and the February 2026 cybersecurity guidance extend oversight to third-party software, cloud and service components (this concerns device components, not QMS tooling, but raises general vendor scrutiny). — [MedDeviceGuide: QMSR supplier quality agreements for cloud vendors](https://meddeviceguide.com/blog/qmsr-supplier-quality-agreement-cloud-ai-cybersecurity-testing-vendors-guide)
- Source-code escrow is increasingly treated as non-negotiable by enterprise procurement in regulated industries, though almost never invoked. For SaaS, code escrow alone is inadequate because service depends on the hosting environment. — [Lowenstein Sandler: escrow agreements reaching for the cloud](https://www.lowenstein.com/news-insights/publications/articles/source-code-escrow-agreements-are-reaching-for-the-cloud-kesslen-satlin); [ACC: placing SaaS in escrow](https://www.acc.com/resource-library/placing-saas-escrow)
- Security questionnaires commonly run to 100+ rows; SOC 2 Type II is reported to answer 60-70% of them (vendor blog figure). A two-person startup reported several enterprise deals stalling without a SOC 2 report and started the process after about 10 requests (promotional case study). — [BuildMVPFast: vendor security questionnaire kit](https://www.buildmvpfast.com/blog/vendor-security-questionnaire-small-saas-tprm-kit-2026); [Secureframe customer story](https://secureframe.com/customers/my-askai)
- SOC 2 Type II audit fee estimates for small companies range from about $7k-50k (Comp AI) and $12k-60k (Beancount) to $30k-80k (Startup Defense). The audit fee is put at about 40% of first-year total once readiness ($5k-25k) and compliance automation software ($5k-30k/year) are included. All vendor blogs with an interest in the answer. — [Comp AI: SOC 2 cost breakdown](https://trycomp.ai/soc-2-cost-breakdown); [Beancount: SOC 2 Type II small SaaS guide (2026)](https://beancount.io/blog/2026/07/14/soc-2-type-ii-small-saas-audit-cost-guide); [Startup Defense: SOC 2 costs for startups](https://www.startupdefense.io/soc-2-costs-for-startups-complete-breakdown-and-budget-guide); [Sprinto](https://sprinto.com/hub/breakdown-of-soc-2-cost/)
- Solo founders are common among bootstrapped companies (38% per Carta data cited by SaaStr) but rarer among VC-backed (17%) and companies that IPO (10-12%). — [SaaStr](https://www.saastr.com/carta-38-of-bootstrapped-start-ups-have-solo-founders-but-only-17-of-vc-backed-ones-do-and-10-12-of-ones-that-ipo)

### Inferences
- An RM tool holds design input/output and traceability records, part of the design history file. A careful manufacturer will classify the vendor as at least medium risk: questionnaire, quality agreement, evidence of the vendor's own development and release process, and the customer's own computerized system validation. A solo vendor can pass this with documents, but each customer costs founder time, and that cost does not shrink with the $2k/year deal size.
- Open source and self-hosting neutralise the "vendor disappears" scenario better than escrow: the customer already has the code, the data and a running deployment. This is a genuine advantage over closed competitors and should be the lead answer to the bus-factor question. It does not cover: security patches after the founder is gone, validation evidence for future versions, or the hosted cloud service, which simply stops.
- For the hosted tier, SOC 2 or ISO 27001 will be requested by mid-size buyers. A realistic first-year cost of roughly $20k-60k (range from the vendor guides above) equals the entire revenue of 10-30 small cloud customers at the planned price. Small medtech startups often accept a questionnaire and the underlying cloud provider's certificates instead; larger ones will not.
- Separation of duties is a structural SOC 2 / ISO 27001 problem for one person (no independent code review, no second approver for production changes). Auditors accept compensating controls, but this is extra work and a likely questionnaire finding.

### Gaps
- No source found that directly addresses single-person software suppliers under ISO 13485 7.4, or real examples of a manufacturer rejecting or accepting one.
- No figures found for professional liability (tech E&O) and cyber insurance premiums for a one-person SaaS vendor, or for typical contractual liability caps demanded by medtech buyers.
- No ISO 27001 cost figures retrieved.
- Escrow service pricing not retrieved.

## 5. Sales cycle, CAC, churn, customers needed for $100k and $300k ARR, time to get there

### Takeaway
At the planned cloud price, the arithmetic needs roughly 40-55 small-team customers for $100k ARR and 125-165 for $300k; with enterprise licences it is 10 and 30. I found no reliable benchmark for sales cycle, CAC or churn specific to RM tools in small medtech, and no clean base rate for time to $100k ARR for bootstrapped B2B SaaS.

### Cited Findings
- ChartMogul (as summarised by MicroConf): the average SaaS in its dataset takes about 2 years 9 months to reach $1M ARR. This is survivorship-biased (companies already tracking revenue in ChartMogul) and not limited to bootstrapped firms. — [MicroConf newsletter](https://microconf.com/themicro-newsletter/september-7)
- ChartMogul (older report via SaaStr): only 13% of tracked startups reach $10M ARR within 10 years. — [SaaStr](https://www.saastr.com/chartmogul-the-best-in-saas-get-to-10m-arr-in-3-years-the-next-best-in-about-5-years)
- A dataset of 3,787 self-reported revenue-generating indie SaaS products gives a median of $145 per month. Skewed to very small consumer and hobby products; not comparable to B2B, but a reminder of how low the unconditional base rate is. — [BigIdeasDB: State of Indie SaaS Revenue 2026](https://bigideasdb.com/state-of-indie-saas-revenue-2026)
- Median annual growth of about 23% for bootstrapped vs 25% for VC-backed SaaS, attributed to SaaS Capital/ChartMogul by a secondary source; unverified. — [FounderPath](https://founderpath.com/blog/saas-growth-rate)
- Documenso, a funded open-core team, reached about 340 paying customers roughly two and a half years after its 2023 launch. — [Documenso 2025 review](https://documenso.com/blog/2025-a-year-in-review)
- Incumbent contract sizes: Greenlight Guru median annual spend about $44k (Vendr procurement data, range roughly $21k-55k); Matrix Requirements about 7.3k EUR/year for a 3-seat Team plan, with a 50% first-year discount for new companies and an automatic 5% annual increase. — [OpenRegulatory: Greenlight Guru price](https://openregulatory.com/articles/greenlight-guru-price); [OpenRegulatory: Matrix Requirements pricing](https://openregulatory.com/articles/matrix-requirements-pricing)

### Inferences
- Arithmetic (mine). Cloud at $30-40 per editor per month = $360-480 per editor per year. Free reviewer seats mean only authors pay; a small medtech team plausibly has 3-8 editors. At 5 editors: $1,800-2,400 per customer per year.
  - $100k ARR: 42-56 customers (208-278 paid editors).
  - $300k ARR: 125-167 customers (625-833 paid editors).
  - Enterprise self-hosted at $10k: 10 customers for $100k, 30 for $300k.
  - A mixed case, e.g. 5 enterprise + 25 cloud teams, is about $100k.
- The cloud tier's revenue per customer (about $2k) is too small to pay for a human-led regulated sale (demo, questionnaire, quality agreement, validation support). It only works as self-serve, and self-serve purchasing is unusual for QMS-relevant tools. The enterprise tier is where a solo founder's time is repaid, so the business is in practice 10-30 enterprise deals, each with the supplier-qualification overhead of section 4.
- Churn has a structural component in this market: early-stage medtech startups fail, get acquired (and are moved to the acquirer's toolchain), or outgrow a small tool. Offsetting that, switching RM tools mid-project is painful and validated tools are sticky. Net direction unknown.
- Time to revenue: regulated buyers are unlikely to adopt before the product has e-signatures, review/approval and a validation pack, all of which are still unbuilt (the project is in Phase 1). First meaningful revenue therefore trails feature completion, plus a qualification cycle per customer. A plan that assumes $100k ARR sooner than 2-3 years after the compliance features ship would be optimistic relative to the comparables in section 1, all of which had more people. This is my judgement, not a sourced base rate.

### Gaps
- No sourced figures for sales-cycle length, CAC or logo churn for RM/eQMS tools sold to small medtech.
- The MicroConf State of Independent SaaS time-to-milestone and churn figures were not retrieved; the report at stateofindiesaas.com should be checked directly. SaaS Capital and OpenView benchmark reports were not retrieved.
- No data on how many editors a typical small medical device team would license.

## 6. Competitive threats: AI-native tools, incumbents' startup tiers, Jira add-ons

### Takeaway
The most direct threat is well funded: Ketryx raised a $39M Series B in September 2025 specifically for AI-driven traceability and compliance documentation for medical device software. Incumbents already ship AI requirement-quality features and startup packages, and two of them raised prices in 2025-2026 rather than cutting them.

### Cited Findings
- Ketryx raised a $39M Series B in September 2025 led by Transformation Capital (with Lightspeed, E14 Fund, Ubiquity and others), taking total funding above $55M. It automates traceability and compliance reporting for FDA and EU MDR using AI. Vendor-claimed results: up to 90% less documentation time, 10x faster release cycles. Named customers include DeepHealth, Heartflow and Aignostics. — [Ketryx blog](https://www.ketryx.com/blog/ketryx-raises-39m-to-advance-ai-compliance-platform); [Bio-IT World, 2025-09-15](https://www.bio-itworld.com/news/2025/09/15/ketryx-secures-$39m-to-transform-compliance-in-ai-powered-medtech); [AI Business](https://aibusiness.com/health-care/ai-startup-raises-39m-to-speed-medical-device-compliance)
- Jama Connect ships "Advisor" (NLP requirement-quality analysis), AI test generation and "Trace Scores"; Visure has an AI assistant (Vivia); Codebeamer and Polarion list AI features. The source roundups are partly vendor-authored and rank inconsistently. — [The Next Web: AI requirements management software 2026](https://thenextweb.com/news/best-ai-requirements-management-software-2026); [HackerNoon roundup](https://hackernoon.com/best-requirement-management-tools-for-automotive-in-2026-8-platforms-reviewed)
- Jama offers a medical device startup package: core capabilities for up to five named creators, with site licences for stakeholders and reviewers; reviewer licences are free. Price not public. — [Jama: medical device startups datasheet](https://www.jamasoftware.com/datasheet/jama-connect-for-medical-device-startups-datasheet/)
- Matrix Requirements dropped its entry "Essential" plan (390 EUR/month, 3 seats) by December 2024, raised remaining plans, and reportedly raised prices a further 10-20% by 2026; it offers 50% off the first year for new companies. — [OpenRegulatory: Matrix Requirements pricing](https://openregulatory.com/articles/matrix-requirements-pricing)
- Greenlight Guru renewals in 2026 reportedly included increases approaching 100% in some cases (competitor-blog claim, unverified). — [OpenRegulatory: Greenlight Guru price](https://openregulatory.com/articles/greenlight-guru-price)

### Inferences
- Incumbent price increases and the removal of Matrix's cheapest plan open room at the low end. This is the best piece of evidence in favour of the plan: there is a visibly underserved price point between spreadsheets and about 7k EUR/year.
- The low end is also where buyers have the least money and the highest failure rate, and where "Word/Excel plus a Jira plugin" is the real competitor. Incumbent startup programmes (Jama's five-creator package, Matrix's 50% first year) target the same accounts with established brands and existing validation documentation.
- AI is the feature axis on which funded competitors are moving fastest, and it is awkward for this project: a self-hosted AGPL tool cannot assume an LLM API, regulated customers may forbid sending design data to third-party models, and AI features in a validated tool need their own validation story. A bring-your-own-key or local-model option is possible but is more work for one person. Conversely, "no data leaves your server" is a real selling point against cloud AI tools for some buyers.
- General-purpose LLMs can already draft requirements and check wording quality outside any RM tool. That commoditises the "requirement quality check" feature and leaves the system-of-record functions (versioning, baselines, trace, signatures) as the durable value, which is where this project's design is focused.

### Gaps
- Jira/Confluence add-ons for medical device requirements and traceability were not researched in this pass (the search did not return them).
- Ketryx pricing and any startup tier were not found. Jama's startup package price is not public.
- No evidence found of incumbents cutting prices; the evidence found points the other way.
- No data on customer counts or revenue of Matrix Requirements, Ketryx or Jama's medtech segment.

## 7. Market context: funding climate, number of small device companies, MDR and QMSR

### Takeaway
The addressable population is large on paper (38,000+ European medtech companies, about 90% SMEs; roughly 18,700 FDA-registered manufacturers in older data), but early-stage medtech funding deteriorated through 2025, which directly reduces new tool purchases by the smallest companies.

### Cited Findings
- MedTech Europe Facts & Figures 2025 (published 4 September 2025): 38,000+ medical technology companies in Europe, about 90% SMEs, the majority with fewer than 50 employees; 930,000+ direct employees. Most companies are in Germany, then Italy, the UK, France and Switzerland. — [MedTech Europe press release](https://www.medtecheurope.org/2025/09/04/medtech-europe-unveils-facts-figures-2025-a-snapshot-of-innovation-and-impact-in-europe/)
- US: about 18,716 medical device manufacturers registered with FDA, 8,995 US-based; roughly three-quarters have fewer than 10 employees and about 3.7% more than 100. From a Food and Drug Law Journal article (about 2017); dated. — [FDLI](https://www.fdli.org/?p=2710)
- PitchBook: medtech companies raised $12B across 647 deals in the first nine months of 2025; on course to exceed 2024's $14B in value but with fewer deals than 2024's 948. Analysts described a "deterioration of funding possibilities for early-stage medtech companies and especially ones without AI tailwinds". — [MedTech Dive: medtech VC funding slows in Q3 (PitchBook)](https://www.medtechdive.com/news/medtech-vc-funding-slows-in-q3-pitchbook/805096/)
- PitchBook H1 2025: late-stage deal value rose 25% in Q2, offsetting falling early-stage funding; mature companies were 25% of VC deals vs 11% in 2021, as companies unable to exit raise growth rounds to extend runway. — [MedTech Dive: Q2 2025](https://www.medtechdive.com/news/medtech-vc-funding-q2-2025-pitchbook/758951/)
- J.P. Morgan: Q2 2025 had 90 medtech venture rounds totalling $2.6B; H1 2025 $6.8B across 194 rounds; "flight to quality" into larger, later rounds; weaker Q2 and Q3 after a strong start. J.P. Morgan and PitchBook totals differ because of different definitions. — [J.P. Morgan medtech deck Q3 2025](https://www.jpmorgan.com/content/dam/jpmorgan/documents/cb/insights/outlook/jpm-medtech-deck-q3-2025.pdf); [J.P. Morgan MedTech Deal Report 1H25](https://bioutah.org/wp-content/uploads/2025/07/JPM-MedTech-Deal-Report-1H25.pdf)
- FDA QMSR took effect 2 February 2026, incorporating ISO 13485:2016 by reference into 21 CFR Part 820. — [MedDeviceGuide](https://meddeviceguide.com/blog/supplier-audit-checklist-medical-device-iso-13485-qmsr-critical-suppliers)

### Inferences
- The headline counts overstate the market. Many of the 38,000 European companies are distributors, contract manufacturers, or makers of simple class I devices with little need for a requirements tool. The realistic segment is companies doing active design and development of class II/III (EU IIa and above) devices or software as a medical device. I found no count of that segment.
- "Three-quarters under 10 employees" cuts both ways: many prospects, each with one to three editors and a very small tools budget.
- Fewer early-stage deals means fewer new companies setting up a toolchain, which is the moment an RM tool is bought. Capital-constrained startups are also the ones most attracted to a free self-hosted edition, which grows usage but not revenue.
- QMSR harmonisation removes a US/EU difference rather than adding a new tooling requirement; I found no evidence it drives new RM tool spending. EU MDR has raised documentation burden, but no source retrieved here links it to RM tool budgets.

### Gaps
- No current (2025-2026) count of FDA establishment registrations by size band; the FDLI figure is about nine years old.
- No estimate found of how many companies actively develop devices requiring design controls, in the US or EU.
- Full-year 2025 and 2026 medtech venture totals not retrieved. EY Pulse of the MedTech Industry and AdvaMed figures not retrieved.
- No evidence found on the effect of EU MDR or QMSR on software tool spending.

## 8. Running a hosted cloud service for medtech as one person

### Takeaway
Hosting is technically feasible for one person, but doing it credibly for regulated buyers adds fixed compliance cost and an on-call burden that the planned cloud price does not obviously cover at small customer counts. I found little direct evidence on this question; most of what follows is inference.

### Cited Findings
- First-time SOC 2 Type II total cost components for a small SaaS: audit $12k-60k, readiness $5k-25k, compliance automation $5k-30k per year; internal staff time is often the largest hidden cost. Vendor sources. — [Beancount: SOC 2 Type II small SaaS guide (2026)](https://beancount.io/blog/2026/07/14/soc-2-type-ii-small-saas-audit-cost-guide); [Startup Defense](https://www.startupdefense.io/soc-2-costs-for-startups-complete-breakdown-and-budget-guide)
- For SaaS, continuity assurance requires more than code escrow because service availability depends on the hosting environment; escrow vendors sell "SaaS continuity" packages that can stand up a parallel environment. — [Lowenstein Sandler](https://www.lowenstein.com/news-insights/publications/articles/source-code-escrow-agreements-are-reaching-for-the-cloud-kesslen-satlin)
- Publishing a trust centre (security overview, sub-processor list, data-flow document) is reported to let some buyers skip the questionnaire; vendor claim, unverified. — [BuildMVPFast](https://www.buildmvpfast.com/blog/vendor-security-questionnaire-small-saas-tprm-kit-2026)
- Cal.com chose Documenso for DPA and BAA signing, an example of even small open-source SaaS companies needing data-processing and business-associate agreements in place for customers. — [Documenso customer story](https://documenso.com/blog/cal.com-chooses-documenso-for-dpa-and-baa-scalability-and-compliance)

### Inferences
- Requirements data is engineering data, not patient data. HIPAA should normally not apply, and GDPR exposure is limited to user account data, provided customers do not paste patient information into requirements. A DPA, a sub-processor list and EU data residency (an EU region for EU customers) are still expected. Two regions doubles the operational surface for one person.
- A solo operator cannot offer a real 24x7 SLA. Holidays and illness are outages of the support function even when the service is up. Buyers who ask about this will be the same ones asking about SOC 2.
- Backups, tested restores and a documented disaster-recovery procedure are cheap in money and are also the evidence a supplier questionnaire asks for. The larger cost is that a hosted validated system needs controlled releases: customers may want notice, release notes and a validation impact statement before each update, which conflicts with continuous deployment.
- Economically, the hosted tier at about $2k per small customer per year needs roughly 10-30 customers just to pay for a first SOC 2 cycle. Selling self-hosted first and adding cloud later (or hosting without certification for the smallest customers and being explicit about it) reduces fixed cost; it also removes the convenient, self-serve entry point.

### Gaps
- No sources retrieved on actual infrastructure cost, uptime expectations or SLA norms for small medtech SaaS vendors.
- No authoritative source retrieved on whether RM tool vendors are asked for BAAs or HIPAA attestations in practice.
- No data on how incumbents' hosted offerings handle customer-controlled release timing for validated environments.
