# Open-source RM tools and new entrants (2023-2026): does the gap exist?

Research date: 2026-10-12. Repository numbers (stars, forks, last push, latest release, licence) were read from the public GitHub REST API on that date and are cited to the repository page. "Licence not detected" means the GitHub API returned no SPDX identifier; it does not mean the project has no licence.

Overall verdict, stated up front for the report writer: **the claim "nothing else is open source AND self-hostable AND has a GUI a non-developer can use" is false as worded, but a narrower gap is real.** Tuleap (GPL, self-hosted, full web GUI, marketed at medical devices) is the standing counterexample, and at least two small projects (ReqTrackManager, OpenRose) now make the same pitch as this project. What does not exist, on the evidence found, is a *mature, adopted, RM-only, Jama-style* open-source web tool. See the last section.

## Open-source RM tools: inventory

### Takeaway
Open-source RM splits into three groups: (1) healthy but text-file/Git-based tools aimed at engineers (StrictDoc, Doorstop, Sphinx-Needs, TRLC/LOBSTER, OpenFastTrace); (2) database-backed web tools that are either a broad ALM (Tuleap, OpenProject) or niche (BASIL); (3) dead or tiny web/desktop RM-only tools (OSRMT, Eclipse RMF/ProR, redmine_re, ReqTrackManager, OpenRose). No RM-only web GUI project found has meaningful adoption: the biggest dedicated RM repos have 200 to 700 stars and all of those are text-based.

### Cited Findings

Summary table (GitHub API, 2026-10-12):

| Tool | Licence | Stars / forks | Last push | Latest release | UI type |
|---|---|---|---|---|---|
| Doorstop | not detected by API | 680 / 171 | 2026-10-12 | v3.2, 2026-07-10 | YAML files in Git, CLI, generated HTML |
| StrictDoc | Apache-2.0 | 412 / 90 | 2026-10-11 | 0.30.2, 2026-10-09 | Text files (.sdoc) plus a local web server with editing |
| Sphinx-Needs | MIT | 312 / 104 | 2026-10-12 | (repo's latest tag is a sub-package, 2026-10-01) | reStructuredText in Git, generated Sphinx site |
| rmToo | not detected by API | 232 / 60 | 2025-09-26 | v26.0.2, 2025-07-16 | Text files, CLI |
| OSRMT | GPL-2.0 | 217 / 49 | 2020-04-24 | 1.8, 2019-07-07 | Java desktop/browser client, database |
| OpenFastTrace | GPL-3.0 | 198 / 44 | 2026-10-11 | 4.10.0, 2026-09-20 | Markdown/code tags, CLI trace report |
| TRLC (BMW) | GPL-3.0 | 121 / 30 | 2026-10-12 | 3.1.0, 2026-09-30 | Typed DSL text files, CLI |
| LOBSTER (BMW) | AGPL-3.0 | 60 / 24 | 2026-10-12 | 1.0.6, 2026-07-30 | Trace report generator |
| BASIL (ELISA) | GPL-2.0 | 63 / 14 | 2026-10-08 | v1.8.12, 2026-05-08 | Web UI + REST API, database |
| ReqFlow | not detected by API | 40 / 12 | 2025-11-23 | v1.6.0, 2019-03-11 | CLI trace over Word/PDF documents |
| redmine_re plugin | GPL-2.0 | 46 | 2020-04-30 | n/a | Redmine web plugin |
| Capella Requirements add-on | EPL-2.0 | 24 / 20 | 2026-01-20 | n/a | Eclipse desktop add-on, ReqIF import |
| Eclipse RMF (GitHub mirror) | not detected | 5 / 5 | 2023-05-17 | n/a | Eclipse desktop (ProR) |
| OpenProject | GPL-3.0 | 16,399 / 3,551 | 2026-10-12 | v17.9.1, 2026-10-01 | Web app (project management) |
| TestLink | GPL-2.0 | 1,622 | 2025-12-08 | n/a | Web app (test management with requirements) |
| ReqTrackManager | GPL-3.0 | 0 / 0 | 2026-10-13 | none | Web app (Python + TypeScript) |
| OpenRose | Apache-2.0 | 18 | 2026-10-12 | v0.2.0-990 | Web app |
| OpenRegulatory templates | not detected by API | 192 / 59 | 2025-03-19 | none | Markdown templates |
| Innolitics RDM | MIT | 143 / 36 | 2022-10-27 | none | Markdown + Python in Git |

Sources for the table rows: [Doorstop](https://github.com/doorstop-dev/doorstop), [StrictDoc](https://github.com/strictdoc-project/strictdoc), [Sphinx-Needs](https://github.com/useblocks/sphinx-needs), [rmToo](https://github.com/florath/rmtoo), [OSRMT](https://github.com/osrmt/osrmt), [OpenFastTrace](https://github.com/itsallcode/openfasttrace), [TRLC](https://github.com/bmw-software-engineering/trlc), [LOBSTER](https://github.com/bmw-software-engineering/lobster), [BASIL](https://github.com/elisa-tech/BASIL), [ReqFlow](https://github.com/goeb/reqflow), [redmine_re](https://github.com/tmerten/redmine_re), [Capella Requirements](https://github.com/eclipse-capella/capella-requirements-vp), [Eclipse RMF](https://github.com/eclipse-rmf/org.eclipse.rmf), [OpenProject](https://github.com/opf/openproject), [TestLink](https://github.com/TestLinkOpenSourceTRMS/testlink-code), [ReqTrackManager](https://github.com/ballardr/reqtrackmanager), [OpenRose](https://github.com/OpenRose/OpenRose), [OpenRegulatory templates](https://github.com/openregulatory/templates), [Innolitics RDM](https://github.com/innolitics/rdm).

Tuleap (the main counterexample)
- Tuleap is open source under the GPL (Wikipedia lists GPL-2.0-or-later), developed by Enalean, a French company founded in 2011 — [Wikipedia: Tuleap](https://www.wikipedia.org/wiki/Tuleap)
- Its scope is ALM: requirements, risks, tasks, bugs, change requests, user stories, agile and V-model, with a built-in risk system — [Wikipedia: Tuleap](https://www.wikipedia.org/wiki/Tuleap)
- Tuleap's own marketing targets requirements, compliance and "critical projects", and medical device software with a QMS; it is offered in the cloud and on-premises, and advertised as usable in air-gapped environments — [Tuleap landing page](https://content.tuleap.org/lp-ads-en-request-demo), [Tuleap pricing page](https://www.tuleap.com/pricing/)
- A third-party listing gives the Community Edition as free, self-hosted, no user limit, and paid on-premise tiers from EUR 23 per user per month in packs of 25 users (third-party figure, may be out of date) — [FitGap: Tuleap](https://us.fitgap.com/products/tuleap)
- Enalean revenue: the only figure found is a data-aggregator estimate of USD 2.4M revenue and a 22-person team in 2025 (estimate, not a filing) — [Latka](https://getlatka.com/companies/tuleap.org). A 2016 press article listed 20 employees and no disclosed revenue — [Le Journal des Entreprises](https://www.lejournaldesentreprises.com/article/alliance-entre-sogilis-et-enalean-56998)
- Tuleap's canonical source is hosted on Tuleap's own instance (tuleap.net) with a GitHub mirror, per a fork's README (third-party copy) — [GitHub fork README](https://github.com/softwarenerd7/tuleap). The API lookup of `Enalean/tuleap` returned Not Found on 2026-10-12, so no star count is available.

StrictDoc
- Apache-2.0; `strictdoc server .` starts a local web server on 127.0.0.1:5111; 6,753 commits, 160 open issues — [StrictDoc GitHub](https://github.com/strictdoc-project/strictdoc)
- The browser interface lets users view and edit documents and requirements, with edits written back to `.sdoc` files — [StrictDoc User Guide](https://strictdoc.readthedocs.io/en/latest/strictdoc_01_user_guide.html)
- Concurrent multi-user editing of one web server instance, user accounts and notifications are still in the Backlog — [StrictDoc Backlog](https://strictdoc.readthedocs.io/en/stable/strictdoc_28_Backlog.html)
- First browser-interface prototype was late 2022, with a first web release targeted for early 2023 — [StrictDoc development plan](https://strictdoc.readthedocs.io/en/stable/strictdoc_03_development_plan.html)
- An independent comparison describes its ReqIF support as "initial" and possibly tool-specific, and says non-developer contribution and approval governance "need evaluation" — [Arc Skills comparison, updated 2026-10-02](https://www.archelps.com/blog/open-source-requirements-management-tools.html)

Doorstop, Sphinx-Needs, TRLC (text-based)
- Doorstop: requirements as diffable YAML items in Git; the team must define its own lifecycle fields, approval evidence and baselines — [Arc Skills comparison](https://www.archelps.com/blog/open-source-requirements-management-tools.html)
- Doorstop's own listing says other open-source RM tools "are either unmaintained, or in an early stage of development" — [AlternativeTo: Doorstop](https://alternativeto.net/software/doorstop)
- Sphinx-Needs: typed, linked requirement objects inside Sphinx docs, no server; spreadsheet-like editing or graphical change workflows need extra tooling — [Arc Skills comparison](https://www.archelps.com/blog/open-source-requirements-management-tools.html)
- useblocks (the company behind Sphinx-Needs) sells around the MIT core: ubCode (Rust engine, VS Code extension, CLI, MCP server), ubConnect (bridges to DOORS, Polarion, Codebeamer, Jama; described as early stage), and licensed ubTrace packages — [useblocks x-as-code docs](https://x-as-code.useblocks.com/reference/index.html), [ubConnect docs](https://ubconnect.useblocks.com/stable/)
- Older useblocks add-ons use the Business Source License 1.1: free for private projects, commercial projects must buy a licence — [Sphinx-Needs-Extensions](https://sphinx-needs-extensions.readthedocs.io/en/latest/)
- TRLC: typed DSL with static analysis in CI; "not a collaborative browser interface" — [Arc Skills comparison](https://www.archelps.com/blog/open-source-requirements-management-tools.html)

BASIL (ELISA / Red Hat)
- Built at Red Hat for functional-safety certification of its In-Vehicle OS, presented to ELISA in June 2023, then open-sourced under the ELISA GitHub; it has a web interface, REST API, user permissions, change history, a traceability matrix, imports from CSV/JSON/YAML/StrictDoc/SPDX and LLM-assisted drafting of test specs — [ELISA webinar page](https://elisa.tech/webinars/from-requirements-to-code-managing-end-to-end-traceability-with-basil/), [BASIL Updates 2026](https://directory.elisa.tech/annual-update/2026-02/BASIL_Updates_2026.pdf)
- A June 2026 workshop deck still labels it "Work in Progress" — [ELISA London 2026 deck](https://directory.elisa.tech/workshops/2026-06-London/D2-14-00_BASIL.pdf)

OSRMT
- Last development-branch commit 2020-04-24; conventional database-backed app with desktop or browser client; mainly software requirements — [Arc Skills comparison](https://www.archelps.com/blog/open-source-requirements-management-tools.html)
- AlternativeTo marks it Discontinued — [AlternativeTo: OSRMT](https://alternativeto.net/software/open-source-requirements-management-tool/about)
- Vendor-blog listicles in 2026 still recommend OSRMT as the best web-GUI open-source option and call it Apache 2.0 — [The Digital Project Manager, 2026](https://thedigitalprojectmanager.com/tools/best-open-source-requirements-management-tools/); contradicted on licence (GPL-2.0) and on activity (no commits since 2020) by [OSRMT GitHub](https://github.com/osrmt/osrmt)

New direct look-alikes (found during this research)
- ReqTrackManager describes itself as an "open-source, self-hostable, multi-tenant requirements management system" and an alternative to DOORS, Jama Connect, Polarion and Codebeamer, for hardware, firmware and regulated-software teams that cannot justify enterprise tool cost — [ReqTrackManager site](https://ballardr.github.io/reqtrackmanager/), [GitHub](https://github.com/ballardr/reqtrackmanager)
- Its README lists: version history per requirement, baselining on stage approval, formal change requests, threaded discussion, scheduled reviews, typed bidirectional links, CSV import/export, SSO/SCIM design docs and an MCP server — [ReqTrackManager README](https://github.com/ballardr/reqtrackmanager)
- It is a one-person project: 64 commits, one contributor, first commit 2024-10-24, 0 stars, 0 forks, no releases, GPL-3.0, GitHub Sponsors link only — [ReqTrackManager GitHub](https://github.com/ballardr/reqtrackmanager)
- OpenRose: Apache-2.0 web RM application "for individuals & teams", with baselines, traceability and Mermaid diagrams; created 2024-12-12, 18 stars, release v0.2.0-990 — [OpenRose GitHub](https://github.com/OpenRose/OpenRose)

Medical-device-specific open source
- OpenRegulatory publishes free templates for ISO 13485, IEC 62304, ISO 14971 and IEC 62366 (192 stars, last push 2025-03-19) — [openregulatory/templates](https://github.com/openregulatory/templates)
- Formwork (OpenRegulatory's eQMS) is a commercial product, not open source: free tier limited to 5 users and 10 documents, then EUR 99/month and EUR 499/month — [KI-Syndikat listing](https://www.ki-syndikat.de/tools/formwork/); it includes software requirements, tests, test runs and risk items — [Formwork manual](https://openregulatory.com/formwork-documentation/)
- OpenQMS.net is an AGPL-3.0 QMS; a review says it lacks a medical-device requirements module with design-control traceability — [OpenRegulatory review of OpenQMS](https://openregulatory.com/qms_software/openqms)
- Innolitics RDM: Markdown templates and Python scripts in the repo generate 62304/14971/510(k) documents; the vendor says it suits early-stage software-only devices; last push 2022-10-27 — [innolitics/rdm](https://github.com/innolitics/rdm)

Other
- COMET / CDP4: web app and REST API for concurrent engineering (space, ECSS); the Docker build needs a private DevExpress key and it mixes open and proprietary parts — [Arc Skills comparison](https://www.archelps.com/blog/open-source-requirements-management-tools.html)
- OpenProject is positioned by listicles as covering requirements documentation alongside tasks and Gantt charts; it is a general project-management tool — [ONES blog](https://ones.com/blog/tool-guide/requirement-management-with-self-hosted-19/)
- The Arc Skills comparison concludes none of the open-source tools is a feature-for-feature DOORS replacement — [Arc Skills comparison](https://www.archelps.com/blog/open-source-requirements-management-tools.html)

### Inferences
- The star counts are small across the board. The most-starred dedicated RM project (Doorstop, 680) is 13 years old. This suggests open-source RM is a small niche, not an underserved mass market. A new tool should not expect large organic GitHub traction.
- Tuleap is the only open-source product that is mature, self-hostable, GUI-based and already sold into medical devices. Its weakness relative to this project is scope (a full ALM with trackers to configure) rather than availability. The honest positioning is "RM-only and Jama-like", not "the only open-source GUI option".
- ReqTrackManager is the closest look-alike in pitch and feature list. Its code size (about 8.5 MB of Python and 5.8 MB of TypeScript from one contributor in 64 commits) suggests heavy AI-assisted generation. This shows the barrier to building such a tool has fallen, so more look-alikes are likely. Zero stars means it has no visible adoption yet.
- StrictDoc is the text-based tool most likely to grow into the gap: it already has a web editor and lists multi-user editing and accounts in its backlog. Today it is single-user and local.
- Search results for "open source requirements management" are dominated by vendor listicles that recommend a tool dead since 2020 (OSRMT). That is weak evidence that no good answer exists, and also an SEO opening.

### Gaps
- Tuleap: could not confirm which requirements, baseline, test and e-signature features are in the free Community Edition versus paid tiers (the pricing page fetched showed no edition table). This matters most for the verdict and should be checked by hand at tuleap.com/comparisons.
- Tuleap GitHub stars and release cadence: not retrieved (canonical repo is not on GitHub).
- Enalean revenue: no filed accounts retrieved (Pappers/Infogreffe not checked). The USD 2.4M figure is an aggregator estimate.
- Doorstop and rmToo licences: GitHub API did not detect them; not verified from the LICENSE files.
- Doorstop GUIs (the bundled Tk desktop GUI and third-party web front ends): not researched.
- Who uses StrictDoc, Doorstop, Sphinx-Needs (named organisations): no source found in this pass. The StrictDoc release-notes page returned 404.
- useblocks pricing for ubCode/ubTrace: not published in any result found.
- Not researched for lack of time: Redmine and Trac requirement plugins beyond redmine_re, ReqView alternatives, ReqIF support per tool beyond StrictDoc and Capella.

## New commercial entrants 2023-2026

### Takeaway
Venture money is going into AI-assisted, cloud-first requirements tools for hardware (Flow Engineering, Trace.Space, Stell) and into compliance layers over existing developer tools for medtech (Ketryx). None of those found is open source, and none leads with self-hosting. Incumbents are consolidating (Jama to Francisco Partners, Valispace to Altium).

### Cited Findings
- Flow Engineering raised a USD 23M Series A led by Sequoia, with the Collison brothers and David Helgason participating; announced October 2025 — [Flow blog](https://flowengineering.com/blog/flow-raises-23m-from-sequoia-to-accelerate-the-future-of-hardware-development), [Fenwick](https://www.fenwick.com/insights/experience/fenwick-represents-flow-engineering-in-23m-series-a-funding). Total raised is reported as USD 35.8M over 5 rounds by [CB Insights](https://www.cbinsights.com/company/the-engineering-company-1/financials); other aggregators give USD 23M or 32M (sources conflict).
- Flow positions itself as a requirements tool for "new-age" hardware engineering companies — [Flow blog](https://flowengineering.com/blog/flow-raises-23m-from-sequoia-to-accelerate-the-future-of-hardware-development)
- Trace.Space (Riga, founded 2022) raised a USD 4M seed led by Cherry Ventures in February 2025, after a USD 1.5M pre-seed in 2023; AI-enhanced requirements management for industrial products, with medical devices among listed targets — [Tech.eu, 2025-02-06](https://tech.eu/2025/02/06/trace-space-secures-4m-seed-to-expedite-product-development-in-manufacturing/), [Cherry Ventures](https://cherry.vc/news/rebuilding-western-manufacturings-edge-why-were-leading-tracespaces-4m-seed-round)
- Stell (founded 2022, aerospace and defence) raised a USD 3.1M pre-seed (January 2023) and a USD 4M seed (early 2024) — [Crowell & Moring](https://www.crowell.com/en/insights/firm-news/crowell-and-moring-advises-stell-engineering-in-dollar4-million-seed-funding-round). No 2025 round found.
- Ketryx raised a USD 39M Series B in September 2025 led by Transformation Capital with Lightspeed, total USD 57M; it overlays Jira and GitHub to enforce compliance and generate regulatory documentation for medtech — [Ketryx blog](https://www.ketryx.com/blog/ketryx-raises-39m-series-b-from-transformation-lightspeed-to-scale-ai-in-medtech)
- Valispace was acquired by Altium in February 2024 and relaunched as the Altium 365 Requirements & Systems Portal on 2024-09-12; it is now sold as part of Altium Develop — [Valispace site](https://valispace.com/), [BusinessWire, 2024-09-12](https://www.businesswire.com/news/home/20240912616273/en/Requirements-Systems-Portal-Application-Now-Available-on-the-Altium-365-Cloud-Platform)
- Valispace's pricing page lists Altium Develop with unlimited requirements and collaborators at USD 995 per year — [Valispace pricing](https://www.valispace.com/pricing/); a third-party review reports about EUR 960 per year — [se-trends.de](https://www.se-trends.de/en/valispace-altium-requirements-portal/)
- Francisco Partners agreed to acquire Jama Software for USD 1.2B, announced March 2024 — [Paul Hastings](https://www.paulhastings.com/en-GB/news/paul-hastings-advises-francisco-partners-in-usd1-2b-acquisition-of-jama)
- Jama Connect Advisor is an add-on for requirement quality analysis against INCOSE and EARS rules — [Jama datasheet](https://www.jamasoftware.com/datasheet/jama-connect-advisor). Jama does not publish prices; G2 has no vendor-supplied pricing — [G2: Jama Connect pricing](https://www.g2.com/products/jama-connect/pricing)
- ReqView (commercial, file-based desktop/web) lists PRO at EUR 430 and TEAM at EUR 580 per user per year — [Capterra: ReqView pricing](https://www.capterra.com/p/145388/ReqView/pricing/)
- Matrix Requirements: OpenRegulatory reports a 50% first-year discount that then disappears and an automatic 5% yearly increase (a competitor's account, treat as anecdotal) — [OpenRegulatory article](https://openregulatory.com/articles/matrix-requirements-pricing)
- Arc Skills: an MIT-licensed kit of 100 "skills" for AI assistants covering requirements cleanup, review, derivation and traceability, with no shared database or approval workflow — [Arc Skills comparison](https://www.archelps.com/blog/open-source-requirements-management-tools.html)
- Sphinx-Needs (ubCode), ReqTrackManager and Jama all now expose an MCP server so AI assistants can read the requirements graph — [useblocks docs](https://x-as-code.useblocks.com/reference/index.html), [ReqTrackManager README](https://github.com/ballardr/reqtrackmanager), [yespress profile of Jama](https://yespress.io/jama) (the Jama MCP claim comes from a single secondary profile)

### Inferences
- Funded entrants target aerospace, defence, automotive and "new hardware" first; only Ketryx and (partly) Trace.Space address medical devices. Small medical-device teams are not the focus of the best-funded new RM startups.
- Altium Develop at roughly USD 1,000 per year with unlimited collaborators is a low-price commercial anchor. A paid tier of an open-source tool cannot assume Jama-level price comparisons.
- An MCP server or API access for AI assistants is becoming a baseline expectation in 2026, including from a zero-star hobby project.

### Gaps
- Not researched in this pass (no sources gathered): Requiment, Cognition Cockpit, Orcanos, Aligned Elements, SpiraTeam, Helix ALM, Doc Sheets, Visure, Microsoft Copilot-based requirement tools. Funding, pricing and hosting for these remain open.
- Hosting model (cloud-only versus on-premises) for Flow, Trace.Space and Stell was not confirmed.
- Jama's AI feature release dates and per-seat prices: no primary source found.
- Stell's total funding: job postings cite about USD 7.2M, announcements total USD 7.1M across two rounds; no 2025 or 2026 round confirmed.

## Docs-as-code trend

### Takeaway
There is plenty of tooling and vendor advocacy for Git/Markdown requirements, but no adoption data was found. The trend is real among software-led teams and is where almost all healthy open-source RM projects sit, which leaves the GUI-for-non-developers segment comparatively unserved by open source.

### Cited Findings
- Every actively maintained dedicated open-source RM project with more than 100 stars is text-based (Doorstop, StrictDoc, Sphinx-Needs, OpenFastTrace, TRLC) — see the inventory table above; repository pages e.g. [Doorstop](https://github.com/doorstop-dev/doorstop), [StrictDoc](https://github.com/strictdoc-project/strictdoc)
- BMW publishes and actively maintains TRLC and LOBSTER (both pushed 2026-10-12) — [TRLC](https://github.com/bmw-software-engineering/trlc), [LOBSTER](https://github.com/bmw-software-engineering/lobster)
- In a 2021 Hacker News thread (88 points, 67 comments) on requirements tooling, Excel and Word were mentioned most, then Jira, Confluence, Notion and Git-based plain text; roughly 8 to 10 comments described docs-as-code or self-hosted approaches (Markdown in Git, Sphinx-Needs, Innolitics RDM, Redmine) — [Ask HN: What software do you use to gather requirements?](https://news.ycombinator.com/item?id=27615562)
- Innolitics says RDM output documents are Word or PDF files that are then uploaded to a document control system — [innolitics/rdm](https://github.com/innolitics/rdm)
- Ketryx's USD 39M round funds the "keep developers in Jira and GitHub, add compliance on top" model for medtech — [Ketryx blog](https://www.ketryx.com/blog/ketryx-raises-39m-series-b-from-transformation-lightspeed-to-scale-ai-in-medtech)
- GitLab markets its platform for IEC 62304 compliance — [GitLab IEC 62304](https://about.gitlab.com/solutions/iec-62304/)
- An independent comparison flags non-developer contribution and approval governance as the weak point of StrictDoc, Sphinx-Needs, TRLC and Doorstop — [Arc Skills comparison](https://www.archelps.com/blog/open-source-requirements-management-tools.html)

### Inferences
- Docs-as-code shrinks the audience among software-only (SaMD) teams whose requirements authors are developers. Those teams have good free options and a well-funded commercial one (Ketryx).
- It does not serve teams where a quality or regulatory lead, or hardware and clinical staff, author requirements. The same sources that praise text-based tools name non-developer editing and approvals as their gap. That is the segment a GUI tool can claim.
- The first target (small medical device teams) should be qualified further: hardware-plus-software or mixed-discipline teams are a better fit than pure SaMD startups.

### Gaps
- No survey, adoption rate or notified-body statement on docs-as-code in regulated industries was found. Any claim about the size of the shift is an estimate.

## History: open-source RM projects that died or stalled

### Takeaway
RM-only open-source GUI tools have a poor survival record: OSRMT, Eclipse RMF/ProR and the Redmine RE plugin all stalled, and the ones that survived are text-based tools maintained by engineers for their own use or backed by a company (Enalean, useblocks, BMW, Red Hat).

### Cited Findings
- OSRMT: last release 1.8 on 2019-07-07, last commit 2020-04-24 — [OSRMT GitHub](https://github.com/osrmt/osrmt); marked Discontinued — [AlternativeTo](https://alternativeto.net/software/open-source-requirements-management-tool/about)
- Eclipse RMF/ProR: began as university research (Heinrich-Heine University Düsseldorf) funded through research projects (DEPLOY, Verde, then Advance) — [Wikipedia: Requirements Modeling Framework](https://en.wikipedia.org/wiki/Requirements_Modeling_Framework); the standalone ProR build was discontinued and the Eclipse wiki is read-only — [Eclipse wiki: RMF/ProR](https://wiki.eclipse.org/RMF/ProR); the GitHub mirror has 5 stars and no push since 2023-05-17 — [eclipse-rmf](https://github.com/eclipse-rmf/org.eclipse.rmf)
- Redmine RE plugin: last push 2020-04-30 — [redmine_re](https://github.com/tmerten/redmine_re)
- Ephemeris (systems engineering and RM app, MIT): 78 stars, last push 2023-03-02 — [shuart/ephemeris](https://github.com/shuart/ephemeris)
- Innolitics RDM: last push 2022-10-27 — [innolitics/rdm](https://github.com/innolitics/rdm)
- ReqFlow: last release 2019-03-11 — [goeb/reqflow](https://github.com/goeb/reqflow)
- rmToo: still released (v26.0.2, 2025-07-16) but AlternativeTo lists it as Discontinued (sources conflict) — [rmToo GitHub](https://github.com/florath/rmtoo), [AlternativeTo](https://alternativeto.net/software/open-source-requirements-management-tool/about)

### Inferences
- The pattern: projects die when the research grant ends (RMF/ProR) or the single maintainer stops (OSRMT, redmine_re, RDM). Survivors have an employer paying for maintenance. The reasons for each death are inferred from funding and activity data, not stated by the projects.
- For a solo founder, this is the main risk signal in the whole inventory. A credible revenue model (hosting, support, validation packs) matters more than feature parity.
- Buyers in regulated industries will ask what happens if the maintainer disappears. AGPL plus self-hosting partly answers that, but the track record of this category will be raised.

### Gaps
- No post-mortem or maintainer statement was found for OSRMT, RMF/ProR or redmine_re, so the "why" is inference.
- Formal Eclipse project status of RMF (archived or not) was not confirmed at projects.eclipse.org.

## Evidence of users asking for an open-source Jama/DOORS alternative

### Takeaway
Direct, countable demand evidence is thin: a few low-engagement Hacker News posts over ten years, and a steady supply of listicles and look-alike projects that imply search demand. Reddit could not be searched from this environment, so the strongest likely source is missing.

### Cited Findings
- "Ask HN: Open-source requirements management?" asked for something like Polarion or DOORS but smaller; it was posted twice in 2016 and drew 5 points/3 comments and 2 points/0 comments — [HN 12794843](https://news.ycombinator.com/item?id=12794843), [HN 12120499](https://news.ycombinator.com/item?id=12120499)
- In the 2021 HN thread, nobody explicitly asked for an open-source RM tool; one commenter said Jama was not deployed "due to cost" and another advised to "avoid Rational DOORS at all costs" — [HN 27615562](https://news.ycombinator.com/item?id=27615562)
- Recent Show HN launches of new requirements tools got little attention: Sara, a Markdown traceability tool in Rust (2026-01-25, 3 points) — [HN 46752826](https://news.ycombinator.com/item?id=46752826); Raiz, a CLI for tracing requirements (2025-08-09, 1 point) — [HN 44849975](https://news.ycombinator.com/item?id=44849975)
- Several 2026 listicles target the query directly ("best open-source requirements management tools 2026", "self-hosted requirement management") — [The Digital Project Manager](https://thedigitalprojectmanager.com/tools/best-open-source-requirements-management-tools/), [ONES blog](https://ones.com/blog/10-best-self-hosted-requirement-management-systems-for-documentation-in-private-environments/), [LinuxLinks](https://www.linuxlinks.com/best-free-open-source-alternatives-ibm-rational-doors/)
- ReqTrackManager's site is titled "Open Source Requirements Management Software (IBM DOORS Alternative)" — [ReqTrackManager site](https://ballardr.github.io/reqtrackmanager/)

### Inferences
- Hacker News shows weak and infrequent demand: the question is asked rarely and gets little engagement. HN skews to web software developers, who are not the buyer, so this understates demand but does not prove it.
- Listicles written for this search term, plus two independent new projects since late 2024 making the same pitch, suggest people do search for it. They do not show willingness to pay.
- The claimed gap is better supported by supply-side evidence (what exists) than by demand-side evidence (people asking). The founder's planned user interviews are the right way to close this, not more desk research.

### Gaps
- Reddit (r/systems_engineering, r/embedded, r/medicaldevices): blocked for both the search tool and direct API access in this environment. No Reddit thread was read. This is the largest gap in this section.
- INCOSE forums, Elsmar Cove and Stack Exchange were not searched.
- No search-volume data for "open source requirements management" or "Jama alternative" was obtained.

## Verdict: does the claimed gap exist?

### Takeaway
Partly. The strict claim fails on Tuleap and is being contested by new small projects. The defensible claim is narrower: no open-source tool that is RM-only, Jama-style, usable by a quality lead without Git, and also mature and adopted.

### Cited Findings
- Tuleap is GPL, self-hostable, web-based and marketed for medical device software — [Wikipedia: Tuleap](https://www.wikipedia.org/wiki/Tuleap), [Tuleap landing page](https://content.tuleap.org/lp-ads-en-request-demo)
- ReqTrackManager (GPL-3.0) and OpenRose (Apache-2.0) are open-source, self-hostable RM web apps with baselines and links, both started in late 2024, both with negligible adoption (0 and 18 stars) — [ReqTrackManager](https://github.com/ballardr/reqtrackmanager), [OpenRose](https://github.com/OpenRose/OpenRose)
- BASIL has a web UI and database but is scoped to software-safety traceability and labelled work in progress — [ELISA London 2026 deck](https://directory.elisa.tech/workshops/2026-06-London/D2-14-00_BASIL.pdf)
- StrictDoc has a web editor but multi-user use is in the backlog — [StrictDoc Backlog](https://strictdoc.readthedocs.io/en/stable/strictdoc_28_Backlog.html)
- OSRMT, the tool listicles still recommend for this need, has had no commits since 2020 — [OSRMT GitHub](https://github.com/osrmt/osrmt)

### Inferences
- Candidates ranked by how much they threaten the claim: Tuleap (high: mature, funded, already in medtech, but an ALM), StrictDoc (medium: healthy, moving toward a web UI, still file-first and single-user), ReqTrackManager (medium-low today: same pitch, no adoption, one author), OpenRose and BASIL (low), OpenProject (low: not an RM tool).
- Suggested wording for the founder: "the only open-source tool that does requirements management only, with a Jama-style GUI" rather than "the only open-source GUI option". The second version will be rebutted with Tuleap in the first sales call.
- The gap is a gap of maturity and focus, not of existence. That means execution, trust (validation, longevity) and distribution decide the outcome, and that an AI-assisted solo competitor can appear at any time.

### Gaps
- No hands-on trial of Tuleap Community Edition, ReqTrackManager or OpenRose was done. Whether a quality lead can really use each without help is untested.
- Tuleap's free-versus-paid feature split is unverified (see first section). If baselines or requirement-specific features are paid-only, the gap is wider than stated here.
