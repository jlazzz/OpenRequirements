# Hosting options and pricing of commercial RM / ALM / medtech design-control tools (state as of Oct 2026)

Research date: 2026-10-12. Evidence labels used below:
- **[V]** vendor-published (vendor site, docs or datasheet), read directly by fetching the page.
- **[V-snippet]** vendor page content seen only through a search-engine summary; the page itself could not be fetched (404 or redirect). Treat as probable, not verified.
- **[3P]** third-party reported (Vendr, G2, Capterra, GetApp, TrustRadius, OpenRegulatory, partner blogs).
- OpenRegulatory sells a competing eQMS, so its price reports on rivals are interested-party evidence.

No Reddit, Hacker News or Elsmar Cove threads surfaced in any search. No AWS/Azure Marketplace price or government procurement price was retrieved. Those sources are a gap, not a negative finding.

## 1. Is self-hosted / on-premises / private-cloud / air-gapped deployment offered per product, and is it being deprecated?

### Takeaway
Self-hosting is the norm, not the exception, among the enterprise tools: Jama, Polarion, Codebeamer, DOORS Next, Visure, Modern Requirements, ReqView and Tuleap all offer it today, and Jama even ships an air-gapped install. The one clear, dated retreat from self-hosting is Atlassian (Data Center: no new sales since 30 Mar 2026, end of life 28 Mar 2029), which removes Jira + Xray / Requirements Yogi as a self-hosted option for new buyers.

### Cited Findings

**Jama Connect**
- Self-hosted is still shipped: Jama Connect v9.28.x (Self-Hosted) released 2025-11-19 [V-snippet] — [Jama support: v9.28.x](https://support.jamasoftware.com/hc/en-us/articles/41244920807437-Jama-Connect-v9-28-x-V3)
- Jama states that for most organisations it recommends its cloud options (Jama Connect Cloud or Customer-Validated Cloud), and that support does not do maintenance, patching or upgrades for self-hosted customers [V-snippet] — [Self-Hosted Scope of Support](https://support.jamasoftware.com/hc/en-us/articles/24072328211085-Jama-Connect-Self-Hosted-Scope-of-Support)
- Jama publishes a self-hosted-to-cloud migration guide [V-snippet] — [Self-Hosted to Cloud Deployment Migration](https://support.jamasoftware.com/hc/en-us/articles/23457993454477-Self-Hosted-to-Cloud-Deployment-Migration)
- Self-hosted install is via Replicated KOTS; Jama Connect cannot be installed in an existing or shared Kubernetes cluster and must use the KOTS cluster bundled with the installer. The v9.28.x install article is titled "KOTS-only" in one variant and documents upgrading "from traditional to KOTS" [V-snippet] — [Installing and Upgrading v9.28.x](https://support.jamasoftware.com/hc/en-us/articles/41248672999181-Installing-and-Upgrading-Jama-Connect-v9-28-x-KOTS-only)
- An air-gapped install is offered: licence and application updates are delivered without internet API calls, via an "airgap-safe portal" URL and password from the welcome email [V-snippet] — [Installing and Upgrading v9.28.x](https://support.jamasoftware.com/hc/en-us/articles/41248672999181-Installing-and-Upgrading-Jama-Connect-v9-28-x-KOTS-only)
- No formal end-of-life notice for Jama self-hosted was found in any search. Cloud was at 9.33.0 in March 2026 while the latest self-hosted found was 9.28.x (Nov 2025) [V-snippet] — [Jama status: Upgrade US](https://status.jamasoftware.com/incidents/yrl6n1pmy350)

**Siemens Polarion**
- Both models are sold today: on-premise Polarion ALM ("Install Polarion on your private server that your team sets up and maintains") and cloud Polarion X, where Siemens runs setup, security and maintenance [V] — [Siemens Polarion product page](https://www.siemens.com/en-us/products/polarion/)

**PTC Codebeamer**
- Available on premises and as PTC-hosted Codebeamer+ (SaaS). On-premise purchases include Production, QA and Development environments; Codebeamer+ includes Production and Non-production [V-snippet] — [PTC: define environment and license requirements](https://www.ptc.com/en/success-paths/get-started-with-codebeamer/plan/define-environment-and-license-requirements)
- No PTC statement deprecating on-premise Codebeamer was found. A PTC community thread reports PTC plans to end support for on-premises ThingWorx Flow, which the Codebeamer-Windchill integration depends on (user-posted, undated) [3P] — [PTC community thread](https://community.thingworx.com/t5/ThingWorx-Developers/ThingWorx-Flow-deprecation-How-does-this-effect-Codebeamer/m-p/929957)

**IBM DOORS Next**
- G2 lists both a SaaS tier and a perpetual "Authorized User Single Install" licence with 12 months of subscription and support, i.e. on-premises is sold [3P, G2 data last updated 2024-10-09] — [G2: DOORS Next pricing](https://www.g2.com/products/ibm-engineering-requirements-management-doors-next/pricing)
- A UK G-Cloud 14 listing offers DOORS Next as SaaS billed by unique logins per month [3P/government catalogue] — [UK Digital Marketplace G-Cloud 14](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/services/261153167386638)

**Matrix Requirements (MatrixALM / MatrixQMS; listed by some directories under "Matrix One")**
- NOT cloud-only. Vendor docs list, under the Enterprise subscription: on-premises ("the software can run on your own server which you maintain"), a dedicated Google private-cloud instance that can be restricted to VPN access, and a high-redundancy read-only replica. Standard cloud hosting is the default and "the most cost efficient solution" [V, User Manual 2.3, copyright 2024] — [Matrix docs: hosting options](https://docs23.matrixreq.com/usv23/what-are-the-hosting-options-can-i-install-on-prem)
- Directory listings show the vendor name as "Matrix One" on some pages and "Matrix Requirements" / "Matrix Req" on others [3P] — [GetApp: Matrix Requirements](https://www.getapp.com/all-software/a/matrix-requirements/)

**Ketryx**
- NOT cloud-only. Pricing page: "Ketryx runs as cloud-hosted SaaS" and "Enterprise plans can also be deployed single-tenant or on-premises" [V] — [Ketryx pricing](https://www.ketryx.com/pricing)

**Greenlight Guru**
- Described as cloud SaaS hosted on AWS, accessed by browser; no on-premise option was found anywhere [3P, single aggregator repeated across pages] — [rfp.wiki: Greenlight Guru vs Qualio](https://www.rfp.wiki/specialty-industries/manufacturing/quality-management-system-software/greenlight-guru/qualio)

**Qualio**
- Described as cloud-based QMS; vendor says "all the cloud data you'll need is included in your subscription" [3P + V-snippet] — [Vendr: Qualio](https://vendr.com/marketplace/qualio); [Qualio pricing](https://www.qualio.com/pricing)

**ReqView**
- Desktop application; project data is shared via network/cloud drive, Git, SVN or Google Drive, with an open file format. The only server component is an optional floating-licence server, installable on-premises or in the cloud [V] — [ReqView pricing](https://www.reqview.com/pricing/)

**Modern Requirements4DevOps**
- Deployable on-premise or cloud-hosted (it runs on Azure DevOps / Azure DevOps Server) [3P] — [Gartner Peer Insights](https://www.gartner.com/reviews/product/modern-requirements4devops)

**Visure Requirements**
- No deployment statement was retrieved from Visure's own site in this pass (see Gaps).

**Jira + Xray / Requirements Yogi / similar**
- Atlassian Data Center end of life: new-licence sales for DC products and DC Marketplace apps ended 30 Mar 2026 (existing customers can still buy apps); last renewals/expansions 30 Mar 2028; all DC and DC-app licences expire into read-only mode on 28 Mar 2029. Announced around September 2025 [3P partner reports, consistent across several] — [Seibert Group: End of Life Atlassian Data Center](https://us.seibert.group/blog/end-of-life-atlassian-data-center); [Actonic statement](https://actonic.de/en/statement-regarding-atlassian-data-center-end-of-life/); [Atlassian developer community post](https://community.developer.atlassian.com/t/from-data-center-to-cloud-the-next-chapter-for-marketplace-apps/95173)
- New Data Center apps stopped being accepted on the Marketplace on 16 Dec 2025 [3P, one source only] — [Actonic statement](https://actonic.de/en/statement-regarding-atlassian-data-center-end-of-life/)

**Tuleap**
- "Available in the cloud and on-premises" [V] — [Tuleap pricing](https://www.tuleap.com/pricing/)
- G2 lists three plans: MyTuleap, Cloud Premium, Enterprise On-Premise [3P, updated 2026-02-09] — [G2: Tuleap pricing](https://g2.com/products/tuleap/pricing)

### Inferences
- "Self-hosted" alone does not differentiate against Jama, Polarion, Codebeamer, DOORS Next, Tuleap or ReqView. What might: self-hosting that a 3-10 person team can actually run (one Docker Compose file versus Jama's dedicated KOTS cluster), self-hosting on the cheapest tier (Matrix and Ketryx restrict it to Enterprise), and no licence server or vendor portal at all.
- Jama's self-hosted line trails its cloud line by several versions and is explicitly not the recommended option. That is steering, not deprecation. A claim that "Jama is going cloud-only" is not supported by the evidence found.
- The Atlassian DC end of life is the strongest tailwind found: a regulated team that wanted Jira-based RM on its own servers can no longer buy it new.
- Of the medtech-specific rivals, only Greenlight Guru and Qualio look cloud-only, and both are eQMS-first rather than RM-first.

### Gaps
- IBM DOORS classic (v9.x): nothing retrieved on current hosting or support status. It is historically an on-premises client-server product; unverified here.
- Visure deployment options (on-prem vs cloud) not confirmed from a vendor source.
- Greenlight Guru and Qualio: no vendor statement explicitly ruling out single-tenant or on-prem. "Cloud-only" rests on third-party descriptions and the absence of any on-prem mention.
- Matrix Requirements acquisition / rename: no source documents an acquisition or dates a rebrand. Only directory listings using "Matrix One". Unconfirmed.
- Jama's long-term self-hosted roadmap: no public statement found either way. The Jama cloud-vs-self-hosted PDF could not be parsed.
- Whether Matrix on-prem docs (Manual 2.3, 2024) still reflect the 2026 offer.
- Whether Ketryx on-prem is truly air-gappable; the pricing page does not say.
- Codebeamer on-premise lifecycle: no PTC statement found.

## 2. Are Matrix Requirements, Greenlight Guru and Ketryx really cloud-only?

### Takeaway
No for two of the three. Matrix Requirements and Ketryx both offer on-premises (and Matrix a VPN-only private cloud), but only on their Enterprise tier. Greenlight Guru appears cloud-only, on third-party evidence.

### Cited Findings
- Matrix Requirements Enterprise: on-premises on the customer's own server, or a dedicated Google Cloud instance accessible only by VPN; vendor helps with setup [V] — [Matrix docs: hosting options](https://docs23.matrixreq.com/usv23/what-are-the-hosting-options-can-i-install-on-prem)
- Matrix says most customers choose Matrix-provided hosting [V] — [Matrix docs: hosting options](https://docs23.matrixreq.com/usv23/what-are-the-hosting-options-can-i-install-on-prem)
- Ketryx: "Enterprise plans can also be deployed single-tenant or on-premises" [V] — [Ketryx pricing](https://www.ketryx.com/pricing)
- Greenlight Guru: AWS-hosted SaaS; mandatory paid one-time onboarding before go-live [3P] — [rfp.wiki: Greenlight Guru vs Qualio](https://www.rfp.wiki/specialty-industries/manufacturing/quality-management-system-software/greenlight-guru/qualio)

### Inferences
- The founder's assumption "medtech rivals are cloud-only" is wrong as stated. The accurate version: medtech rivals are cloud-first, and self-hosting is gated behind their most expensive tier (Matrix Enterprise is listed at EUR 2,240/month or USD 3,390/month, see question 3).
- A small team cannot get a self-hosted, medtech-specific RM tool cheaply today. That narrower claim is supported.

### Gaps
- Actual price uplift for Matrix or Ketryx on-prem is not published.
- No customer report found of anyone actually running Matrix or Ketryx on-prem.

## 3. Published or credibly reported prices

### Takeaway
Only ReqView, Tuleap (cloud tiers) and the Atlassian Marketplace apps publish real per-seat prices; Ketryx publishes only a USD 0 tier. Reported annual spend clusters at roughly USD 20k-60k for the medtech eQMS tools and a USD 61k median for Jama, against about EUR 440-600 per user per year for ReqView.

### Cited Findings

**ReqView [V, fetched Oct 2026]**
- PRO EUR 440 per user per year; TEAM EUR 600 per user per year; ENTERPRISE EUR 1,800 per floating client per year, minimum 3 clients (EUR 5,400/year). 3- and 6-month terms available; no monthly plans, no perpetual licences — [ReqView pricing](https://www.reqview.com/pricing/)
- Capterra/GetApp show slightly older figures (EUR 430 / 580 / 1,740) [3P] — [Capterra: ReqView pricing](https://www.capterra.com/p/145388/ReqView/pricing/)

**Tuleap**
- myTuleap SaaS EUR 13 per user per month, up to 30 users; Premium Cloud EUR 25 per user per month, sold as a 25-user pack, quote from 50 users; billed annually, excl. VAT [V-snippet; the fetched page did not render the numbers] — [Tuleap pricing](https://www.tuleap.org/pricing/)
- Capterra lists "Tuleap Expert - On-premises" at EUR 8 per user per month; conflicts with the vendor's cloud numbers and is likely stale [3P] — [Capterra: Tuleap pricing](https://www.capterra.com/p/175234/Tuleap/pricing/)
- G2: Enterprise On-Premise pricing is negotiated with the seller [3P] — [G2: Tuleap pricing](https://g2.com/products/tuleap/pricing)

**Jama Connect**
- Vendr marketplace: median buyer pays USD 61,455 per year, 7 purchases, range USD 56,311 to USD 981,966 [3P] — [Vendr: Jama Software](https://vendr.com/marketplace/jama-software)
- Vendr buyer guide gives a different average, about USD 92,000 per year, max about USD 200,000 [3P; conflicts with the marketplace page] — [Vendr buyer guide: Jama](https://www.vendr.com/buyer-guides/jama-software)
- G2: Jama "has not provided pricing information"; estimate based on 4 purchases [3P] — [G2: Jama Connect pricing](https://www.g2.com/products/jama-connect/pricing)
- Jama has a "Jama Connect for Medical Device Startups" offer (datasheet exists; price not retrieved) [V-snippet] — [Jama startup datasheet](https://www.jamasoftware.com/datasheet/jama-connect-for-medical-device-startups-datasheet/)

**Siemens Polarion**
- Polarion X Base listed from USD 42 per user per month with a 20-user limit, 25,000 work items, 500 documents, and "1x reviewers per licence" [3P: G2 and TrustRadius] — [G2: Compare MR4DevOps vs Polarion](https://www.g2.com/compare/modern-requirements4devops-vs-polarion)
- Polarion X Premium page showed a volume calculator with an example averaging USD 125 per user, USD 2,500 per month; Polarion X billed annually; deployment included [V-snippet; URL now redirects to the product page] — [Polarion X Premium](https://polarion.plm.automation.siemens.com/premium)
- On-premise perpetual: annual support and maintenance is 20% of licence cost, mandatory in year one [V-snippet; URL now redirects] — [Polarion standard pricing](https://polarion.plm.automation.siemens.com/products/standard-pricing)
- Perpetual single-user licence from about USD 2,490; annual subscription from USD 1,788 per user with a 10-user minimum [3P, undated, unconfirmed] — [zoftwarehub: Polarion ALM pricing](https://zoftwarehub.com/en-ae/products/polarion-alm/pricing)

**PTC Codebeamer**
- PTC publishes no numeric prices; licensing depends on edition, user type and deployment [3P] — [OpenRegulatory: Codebeamer review](https://openregulatory.com/qms_software/codebeamer)
- Capterra "starting price" USD 1,500 per user (period not stated) [3P] — [Capterra: Codebeamer](https://www.capterra.co.uk/software/92177/codebeamer)

**IBM DOORS Next**
- Professional SaaS from USD 164 per user per month [3P; G2 data last updated 2024-10-09] — [G2: DOORS Next pricing](https://www.g2.com/products/ibm-engineering-requirements-management-doors-next/pricing)

**Visure Requirements**
- Capterra/GetApp starting price USD 2,990 (unit and period not stated) [3P] — [Capterra: Visure](https://www.capterra.co.uk/software/146581/visure-requirements)
- Visure says pricing varies by company, licence type and add-ons [V-snippet] — [Visure contact page](https://visuresolutions.com/contact)
- Related small-vendor data point, Aligned Element (medtech design-control tool, not Visure): floating licence EUR 2,400 per year, node-locked EUR 1,300 per user per year [3P, vendor-supplied to G2] — [G2: Aligned Element](https://www.g2.com/products/aligned-element/reviews?page=2)

**Matrix Requirements**
- Mid-2024: Essential EUR 390/month and Team EUR 580/month, each with 3 seats; Enterprise EUR 2,130/month. Later 2024: Team EUR 610, Enterprise EUR 2,240, and the Essential plan removed [3P, competitor] — [OpenRegulatory: Matrix Requirements pricing](https://openregulatory.com/articles/matrix-requirements-pricing)
- 2026 update: a customer reported 50% first-year discount for new buyers, then full price plus an automatic 5% yearly increase [3P, competitor, single customer report; article last updated 2026-05-18] — [OpenRegulatory: Matrix Requirements pricing](https://openregulatory.com/articles/matrix-requirements-pricing)
- Capterra: Team Plus USD 920/month, Company Plus USD 1,390/month, Enterprise Plus USD 3,390/month [3P; about USD 11,040/year minimum] — [Capterra: Matrix Requirements](https://www.capterra.com.au/software/1106353/Matrix-Requirements)
- Older listing: from USD 470, also USD 700 and USD 1,050 per month [3P, likely stale] — [GetApp: Matrix Requirements medical](https://www.getapp.com/operations-management-software/a/matrix-requirements-medical/)

**Greenlight Guru**
- Vendr: median USD 43,989 per year, 4 purchases, range USD 20,975 to USD 54,739 [3P] — [Vendr: Greenlight Guru](https://www.vendr.com/marketplace/greenlight-guru)
- Customer reports: small startups USD 25k-35k per year; one customer with 15-20 full and about 10 lite users paid USD 50k-60k per year [3P, competitor, anecdotal] — [OpenRegulatory: Greenlight Guru price](https://openregulatory.com/articles/greenlight-guru-price)

**Ketryx**
- Free plan: USD 0 per year for pre-market companies that have raised under USD 2 million. Startup, Business, Enterprise: contact sales [V] — [Ketryx pricing](https://www.ketryx.com/pricing)
- Free-plan limits reported as 3 projects, 150 configuration items, 4 users, 50 generated documents per year, 10 GB [V-snippet; the directly fetched page did not show these limits] — [Ketryx plans 2026](https://llm.ketryx.com/content/pricing-2026/index.html)

**Qualio**
- About EUR 25,000 per year reported by customers, covering roughly 1-3 "complete" seats [3P, competitor, anecdotal] — [OpenRegulatory: Qualio price](https://openregulatory.com/qualio-price/)
- Vendr's Qualio page shows USD 0, evidently a placeholder [3P] — [Vendr: Qualio](https://vendr.com/marketplace/qualio)

**Modern Requirements4DevOps**
- Capterra starting price USD 650 (unit and period not stated); otherwise quote on request [3P] — [Capterra: Modern Requirements](https://www.capterra.co.uk/software/125390/modern-requirements-suite)

**Jira add-ons (Cloud)**
- Xray Standard Cloud: USD 10/month or USD 100/year flat for up to 10 Jira users; priced on total Jira user count, not Xray users [3P community post] — [Atlassian Community](https://community.atlassian.com/forums/App-Central-questions/How-does-X-Ray-Flat-Fee-work-Same-with-Zephyr/qaq-p/3191570)
- Deviniti Requirements and Test Management for Jira: USD 80/year for up to 10 users, rates effective 2026-07-16 [V, app vendor] — [Deviniti 2026 pricing](https://deviniti.com/requirements-and-test-management-for-jira-updated-pricing/)
- Jira itself: free up to 10 users; Standard about USD 7.53 per user per month [3P] — [eesel: Jira pricing guide 2026](https://www.eesel.ai/blog/jira-pricing-guide)

### Inferences
- The realistic price floor a small medtech team faces is not Jama. It is Jira Cloud + Xray (about USD 100/year for 10 users), Ketryx Free (USD 0), and ReqView (EUR 440/user/year). An open-source tool competes with near-free at the bottom, so price alone is a weak wedge; self-hosting, Part 11 fit and a Jama-style UI must carry it.
- Ketryx Free is capped at pre-market companies under USD 2M raised, so it is a funnel, not a durable home. Matrix removing its entry plan and adding compounding rises is evidence of small-team price pain in exactly the target segment.
- Vendr medians are tiny samples (4-7 deals) and skew to larger buyers. They are order-of-magnitude indicators only.

### Gaps
- No vendor-published price for Jama, Codebeamer, DOORS (classic or Next), Visure, Greenlight Guru, Qualio, Modern Requirements, Matrix (vendor page not retrieved; all Matrix figures are third-party) or Tuleap on-premise.
- Requirements Yogi price: not found. Xray Data Center price: not found (and moot for new buyers).
- DOORS classic price: no credible figure. One "2026 buyer's guide" page quoting USD 2,000-15,000 per seat had no author or method and was discarded.
- No AWS/Azure Marketplace, GSA or other procurement price lines were retrieved.
- Jama medical-device-startup package price not retrieved.

## 4. Free or cheaper reviewer / read-only / approver / floating licences

### Takeaway
Free reviewers are already standard at the leader: Jama bundles unlimited stakeholder and reviewer site licences and markets "no charge for reviewers". ReqView's free tier opens any project read-only. "Free reviewer seats" is therefore parity with Jama, not a differentiator; it differentiates only against Polarion, Codebeamer+, Greenlight Guru and Visure, which charge for lighter seats.

### Cited Findings
- Jama: base package gives up to 10 named Creators (or an equivalent named/floating mix) plus site licences for Stakeholders and Reviewers [V] — [Jama licensing datasheet page](https://www.jamasoftware.com/datasheet/jama-connect-licensing)
- Jama markets no charge for hosting, reviewers, API usage, file storage or hosted sandbox [V-snippet; jamasoftware.com/pricing returned 404 on direct fetch] — [Jama pricing (legacy URL)](https://www.jamasoftware.com/legacy/platform/pricing/)
- Jama: REST API requires a named Creator licence; floating creators do not get API access. Reviewers on PeerSpot say floating licences are proportionally more expensive than in other tools and creator licences get expensive at scale [V-snippet + 3P] — [PeerSpot/IT Central Station: Jama pricing](https://www.itcentralstation.com/products/jama-connect-pricing)
- Polarion: REVIEWER is a paid low-cost add-on licence for commenting, approving and signing; minimum 10 reviewer licences; PRO and REVIEWER only sold as add-ons. Named and concurrent licences both exist [V-snippet; URL now redirects] — [Polarion standard pricing](https://polarion.plm.automation.siemens.com/products/standard-pricing)
- Polarion X Base: "1x reviewers per licence" bundled [3P] — [G2: Compare MR4DevOps vs Polarion](https://www.g2.com/compare/modern-requirements4devops-vs-polarion)
- Codebeamer: on-premise supports registered (named) seats and concurrent/floating licences; Codebeamer+ uses registered seats and distinguishes Full Users from Collaborators [3P] — [OpenRegulatory: Codebeamer review](https://openregulatory.com/qms_software/codebeamer)
- Visure: two main licence types, Read & Write and Read Only (priced, not stated as free) [V-snippet] — [Visure contact page](https://visuresolutions.com/contact)
- Greenlight Guru: full and "lite" seats, both paid [3P] — [OpenRegulatory: Greenlight Guru price](https://openregulatory.com/articles/greenlight-guru-price)
- ReqView: FREE plan opens any project read-only (browse, search, filter, compare); editing limited to 1 document, 150 objects, 1 custom attribute. Enterprise floating licence allows unlimited users; vendor suggests 1 floating client per 3 infrequent users [V] — [ReqView pricing](https://www.reqview.com/pricing/)
- Modern Requirements / Azure DevOps: reviewers can be placed in the free Stakeholder access level on Azure DevOps Server without a CAL [3P/Microsoft docs, old (TFS 2015)] — [Microsoft Learn](https://learn.microsoft.com/de-ch/previous-versions/azure/devops/project/feedback/give-permissions-feedback?view=tfs-2015)
- Xray on Jira Cloud is charged on every Jira user, so reviewers who have Jira seats are paid for [3P] — [Atlassian Community](https://community.atlassian.com/forums/App-Central-questions/How-does-X-Ray-Flat-Fee-work-Same-with-Zephyr/qaq-p/3191570)

### Inferences
- The assumption "enterprise rivals charge for reviewer seats" is false for Jama, the stated reference product, and true for Polarion (10-seat minimum) and probably Codebeamer+ and Visure.
- Jama's free reviewers come attached to a 10-creator base package, so the honest contrast is "free reviewers without a five-figure base package".
- Part 11 e-signature approvals by free reviewer accounts could still be a real edge if rivals require a paid seat to sign; this was not established.

### Gaps
- Whether Jama's free reviewers can apply Part 11 electronic signatures, and whether the free-reviewer term holds for self-hosted contracts.
- Price of Polarion REVIEWER, Codebeamer Collaborator and Visure Read Only licences.
- Reviewer/read-only terms for DOORS Next, Matrix, Ketryx, Qualio, Tuleap and Modern Requirements were not found.
- Jama's fourth licence type (the page mentions four, names three).

## 5. Which publish prices openly versus require a sales call?

### Takeaway
Public pricing is rare and concentrated at the low end: ReqView, Tuleap cloud and Atlassian Marketplace apps. Every enterprise and medtech-specific rival requires a sales conversation for a real number, so "public pricing" is a genuine differentiator against them.

### Cited Findings
- Public, complete: ReqView [V] — [ReqView pricing](https://www.reqview.com/pricing/)
- Public for cloud tiers, quote for on-premise and for 50+ users: Tuleap [V-snippet + 3P] — [Tuleap pricing](https://www.tuleap.org/pricing/); [G2: Tuleap](https://g2.com/products/tuleap/pricing)
- Public: Atlassian Marketplace apps such as Deviniti RTM [V] — [Deviniti 2026 pricing](https://deviniti.com/requirements-and-test-management-for-jira-updated-pricing/)
- Free tier public, all paid tiers "contact sales": Ketryx [V] — [Ketryx pricing](https://www.ketryx.com/pricing)
- Sales call: Jama (G2: no pricing provided) [3P] — [G2: Jama Connect pricing](https://www.g2.com/products/jama-connect/pricing)
- Sales call: Polarion. Product page has no prices and a "Contact Sales" button; the former public standard-pricing and Premium calculator URLs now 301-redirect to it [V] — [Siemens Polarion product page](https://www.siemens.com/en-us/products/polarion/)
- Sales call: Codebeamer [3P] — [OpenRegulatory: Codebeamer review](https://openregulatory.com/qms_software/codebeamer)
- Sales call: Greenlight Guru (no list prices published) [3P] — [OpenRegulatory: Greenlight Guru price](https://openregulatory.com/articles/greenlight-guru-price)
- Sales call: Qualio ("bespoke pricing estimate" after a conversation) [V-snippet] — [Qualio pricing](https://www.qualio.com/pricing)
- Sales call: Visure [V-snippet] — [Visure contact page](https://visuresolutions.com/contact)
- Sales call: Modern Requirements [3P] — [Capterra: Modern Requirements](https://www.capterra.co.uk/software/125390/modern-requirements-suite)
- Sales call: DOORS Next (G2: final cost negotiated with seller) [3P] — [G2: DOORS Next pricing](https://www.g2.com/products/ibm-engineering-requirements-management-doors-next/pricing)
- Matrix Requirements: plan prices appear in directories and in OpenRegulatory's account of the vendor's price list, implying a public or semi-public price list at least through 2024 [3P] — [OpenRegulatory: Matrix Requirements pricing](https://openregulatory.com/articles/matrix-requirements-pricing)

### Inferences
- Siemens appears to have withdrawn public Polarion pricing (both old pricing URLs now redirect). This is inferred from the redirects, not from a Siemens statement.
- "Enterprise rivals hide prices" holds. The exceptions (ReqView, Tuleap, Jira apps) are the tools nearest the founder's own price point, so those are the ones a public price list will be compared against.

### Gaps
- Whether Matrix Requirements still shows prices on its own site in 2026 (vendor pricing page not fetched).
- Whether IBM lists DOORS Next prices on ibm.com in 2026.

## 6. Minimum contract sizes or seat minimums that price out small teams

### Takeaway
Several rivals have structural floors: Jama's base package is built around 10 creators, Polarion needs 10 reviewer licences (and reportedly 10 subscription users), ReqView Enterprise starts at 3 floating clients, Matrix plans are flat monthly bundles, and Greenlight Guru requires paid onboarding. Reported entry spend for a medtech startup on the commercial medtech tools is roughly USD 11k-35k per year.

### Cited Findings
- Jama: base package = up to 10 named Creators plus unlimited stakeholder/reviewer site licences [V] — [Jama licensing datasheet page](https://www.jamasoftware.com/datasheet/jama-connect-licensing)
- Jama: lowest Vendr-observed deal USD 56,311 per year [3P, 7 purchases] — [Vendr: Jama Software](https://vendr.com/marketplace/jama-software)
- Polarion: minimum 10 Reviewer licences [V-snippet] — [Polarion standard pricing](https://polarion.plm.automation.siemens.com/products/standard-pricing)
- Polarion: subscription reportedly has a 10-user minimum; Polarion X Base capped at 20 users [3P] — [zoftwarehub](https://zoftwarehub.com/en-ae/products/polarion-alm/pricing); [G2 comparison](https://www.g2.com/compare/modern-requirements4devops-vs-polarion)
- ReqView Enterprise: minimum 3 floating clients, EUR 5,400/year. PRO/TEAM have no minimum (1 user) [V] — [ReqView pricing](https://www.reqview.com/pricing/)
- Tuleap Premium Cloud: 25-user pack at EUR 25/user/month, i.e. about EUR 7,500/year minimum; myTuleap capped at 30 users [V-snippet; the annual figure is my arithmetic] — [Tuleap pricing](https://www.tuleap.org/pricing/)
- Matrix Requirements: plans are flat monthly bundles with 3 seats; cheapest reported current plan EUR 610/month or USD 920/month; entry Essential plan removed [3P] — [OpenRegulatory: Matrix Requirements pricing](https://openregulatory.com/articles/matrix-requirements-pricing); [Capterra](https://www.capterra.com.au/software/1106353/Matrix-Requirements)
- Greenlight Guru: required Core package plus mandatory one-time onboarding; lowest Vendr deal USD 20,975/year [3P] — [Vendr: Greenlight Guru](https://www.vendr.com/marketplace/greenlight-guru)
- Qualio: about EUR 25k/year for 1-3 full seats [3P, anecdotal] — [OpenRegulatory: Qualio price](https://openregulatory.com/qualio-price/)
- Ketryx Free: maximum 4 users, 150 configuration items, eligibility limited to under USD 2M raised [V-snippet] — [Ketryx plans 2026](https://llm.ketryx.com/content/pricing-2026/index.html)
- Codebeamer on-premise bundles three environments; Dev and QA each include 1 concurrent + 3 registered licences [V-snippet] — [PTC success path](https://www.ptc.com/en/success-paths/get-started-with-codebeamer/plan/define-environment-and-license-requirements)

### Inferences
- A 3-5 person medtech team today chooses between (a) near-free but not self-hostable or not RM-shaped (Jira Cloud + Xray, Ketryx Free), (b) cheap, file-based and desktop (ReqView), or (c) USD 11k+ per year with cloud-first hosting (Matrix, Greenlight Guru, Qualio, Jama). No option found is web-based, self-hostable, RM-focused and priced for under 10 seats. That gap is real; Tuleap Community Edition (open source, outside this brief) is the closest thing to check.
- Corrected positioning the evidence supports: "self-hosted on every tier, no seat minimum, public prices". "Free reviewers" should be dropped as a headline claim or reframed against Jama's 10-creator floor.

### Gaps
- Contract-term minimums (multi-year lock-in, auto-renewal uplifts) were found only for Matrix (reported 5% yearly rise). Nothing for Jama, Polarion, Codebeamer, Greenlight Guru.
- Seat minimums for Codebeamer, DOORS Next, Visure, Modern Requirements and Qualio not found.
- No first-hand small-team buyer accounts (Reddit, Elsmar Cove, HN) were found to corroborate any of the third-party figures.
