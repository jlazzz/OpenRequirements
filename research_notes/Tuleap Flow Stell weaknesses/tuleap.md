# Tuleap (Enalean) as a requirements management tool, state as of 2025-2026

Research date: 2026-10-12. Method note for the report writer: pages were read through a fetch tool that summarises the page, and several facts came only from search-result summaries. Each finding is tagged:

- **[V-fetched]** vendor page fetched and read in this session
- **[V-snippet]** vendor page seen only through a search-result summary (not re-read; treat as likely but unconfirmed)
- **[3P]** third-party claim
- G2 and Capterra review pages returned HTTP 403, so individual reviews could not be read first-hand. Review quotes below are from search summaries only.
- No Reddit or Hacker News thread about Tuleap was found. No GitHub issue data was collected (Tuleap's own tracker is on tuleap.net, not GitHub issues).

## 1. Which features are in Community Edition versus paid tiers?

### Takeaway
The requirements-specific pieces a Jama-style competitor would be measured against sit in the paid Enterprise distribution: Artidoc (document view of requirements) is stated by the vendor to be Enterprise-only, and Test Management is reported Enterprise-only. Enalean publishes no side-by-side Community vs Enterprise feature matrix, and its user documentation deliberately does not distinguish the two, so the exact split for Baseline, cross-tracker search, LDAP/OIDC, docx export and Jira import could not be confirmed.

### Cited Findings
- **[V-fetched]** Artidoc is "a service available only with the Tuleap Enterprise offering". It is the document-style view: each section of the document is an artifact. — [help.tuleap.com, What is Artidoc](https://help.tuleap.com/docs/en/what-is-artidoc)
- **[V-snippet]** Artidoc was announced with Tuleap 15.10 as "a new plugin for Tuleap Enterprise Edition", and "will be the bedrock of Tuleap Requirement Management later this year", with editing, export, structure, coverage and traceability still to be improved. — [Tuleap 15.10 release notes](https://help.tuleap.com/docs/tuleap-15-10.md)
- **[V-fetched]** Tuleap Enterprise is "a special distribution of Tuleap crafted by Enalean with more plugins and enhanced reliability"; the RPM repository needs credentials from a salesperson. — [docs.tuleap.com, Install packages](https://docs.tuleap.com/installation-guide/step-by-step/install-packages.html)
- **[V-fetched]** The Enterprise install command includes these plugin packages: agiledashboard, api-explorer, archivedeleteditems, artidoc, baseline, botmattermost (x2), captcha, cardwall, crosstracker, document, document_generation, embed, frs, fts-db, git, gitlab, gitlfs, graphontrackers, hudson (x3), jira-import, label, ldap, mediawiki-standalone, oauth2-server, onlyoffice, openidconnectclient, pdftemplate, program_management, projectmilestones, prometheus-metrics, pullrequest, roadmap, svn, taskboard, testmanagement, testplan, timetracking, tracker-functions, velocity. The fetched page showed no Community package list to compare against. — [docs.tuleap.com, Install packages](https://docs.tuleap.com/installation-guide/step-by-step/install-packages.html)
- **[V-fetched]** The plugin catalogue describes: baseline = "Release baselines and comparisons (beta)"; document_generation = exports tracker reports to docx and xlsx; PDF Template = templates for generated PDFs; crosstracker = aggregates data across trackers and projects; testmanagement = test campaigns and traceability; jira-import = imports entire Jira projects; ldap = OpenLDAP and Active Directory; openidconnectclient = delegated login via OIDC. The page as fetched did not mark any plugin as Enterprise-only. — [docs.tuleap.com, Plugins installation](https://docs.tuleap.com/installation-guide/step-by-step/install-plugins.html)
- **[V-snippet]** A search summary of the same plugin page and of a Tuleap forum answer says testmanagement is "part of Tuleap Entreprise" and "the test management part is only in Tuleap Enterprise". This conflicts with the fetched read above, which saw no marking. — [docs.tuleap.com, Plugins installation](https://docs.tuleap.com/installation-guide/step-by-step/install-plugins.html); forum item [tuleap.net aid=21334](https://tuleap.net/plugins/tracker/?aid=21334)
- **[V-snippet]** Community Edition is described in the docs as "the development version of Tuleap with a limited set of plugins"; the Docker Hub image "embed[s] all Tuleap Community Edition plugins". — [Docker Hub, tuleap-community-edition](https://hub.docker.com/r/tuleap/tuleap-community-edition) (page returned 404 when fetched directly; seen in search summary only)
- **[V-snippet]** Community Edition: GPL, free, no limit on users, projects or time, self-hosted, no vendor support or service guarantees, and positioned by the vendor as "mainly intended for evaluation, training, or controlled internal use". — [tuleap.com, Community Edition page](https://www.tuleap.com/tuleap-community-edition-free-jira-alternative/) (direct fetch of this page returned none of this text; unconfirmed)
- **[V-snippet]** Tuleap's user documentation "does not distinguish between an Enterprise version and a Community version". — [docs.tuleap.com, user guide intro](https://docs.tuleap.com/user-guide/intro.html)
- **[V-fetched]** The Enterprise features page lists Tuleap Baseline (snapshots of requirement sets, baseline comparison, audit viewing, "Requirements Export-Import"), Test Management, Documents (versioning, access control, approval workflows, WebDAV), Program Management. It does not mention ReqIF, e-signature, or an audit log by name. — [tuleap.com, Enterprise Edition features](https://www.tuleap.com/product/tuleap-enterprise-edition-features)
- **[V-snippet]** SSO / OpenID Connect is listed as a feature of the paid Premium Cloud and on-premise Expert plans. — [tuleap.com pricing](https://www.tuleap.com/pricing/)

### Inferences
- A team using free Tuleap for requirements gets generic trackers and artifact links, not the document-style requirements view. The Jama-like experience is a paid feature. This is the clearest opening for a free, open-source, document-first RM tool.
- Because the docs do not flag editions, a prospect cannot tell from documentation what the free edition will actually do. That is itself a usability weakness and a source of bad evaluations.
- The source code of the whole product is GPL, so "Enterprise-only" most likely means "not packaged or supported in the Community distribution", not "closed source". A determined user could build the plugins. Not confirmed.

### Gaps
- No vendor Community-vs-Enterprise matrix was found. Whether baseline, crosstracker, ldap, openidconnectclient, document_generation and jira-import are packaged in Community Edition is **not confirmed** either way.
- ReqIF import/export: no mention found anywhere in vendor material. Treat as "no evidence it exists", not as proven absent.
- E-signatures: no mention found. The only approval feature found is "approval workflows" in the Documents (file manager) module.
- Audit trail: no dedicated audit plugin in the catalogue. Tracker artifacts keep per-artifact change history (changesets); a platform-wide audit log was not confirmed.

## 2. How does Tuleap model requirements, and what RM functions does it have?

### Takeaway
Tuleap is a generic tracker engine: a requirement is an artifact in a configurable tracker, linked to other artifacts by typed links, and every edit is a changeset. The RM-specific layer is thin and young: Baseline is officially "beta", "early delivery phase", "not feature complete", it snapshots an Agile backlog milestone rather than a document, and Artidoc document versions are still an "experimental" setting.

### Cited Findings
- **[V-fetched]** Baseline: created from a top-level Backlog milestone (usually a release). It captures title, description and status (as defined by tracker semantics) and linked child artifacts. A past date can be chosen. Two baselines of the same milestone can be compared and the comparison saved. The page states the plugin is in an "early delivery phase" and "not feature complete". — [docs.tuleap.com, Baseline](https://docs.tuleap.com/user-guide/baseline.html)
- **[V-fetched]** Plugin catalogue labels baseline as "(beta)". — [docs.tuleap.com, Plugins installation](https://docs.tuleap.com/installation-guide/step-by-step/install-plugins.html)
- **[3P, snippet]** A G2 reviewer in late 2025 said baseline functionality for versioning a whole project and its documentation at milestones was still missing. — [G2, Tuleap reviews](https://www.g2.com/products/tuleap)
- **[V-fetched]** Artidoc: each section corresponds to an artifact; a tracker must be configured for new sections; changing it affects only new sections. Editor supports Markdown/WYSIWYG and images; tables are not mentioned. Artifact fields (status, priority, owner, links) are shown read-only in the document since Tuleap 16.12. PDF export with templates (cover page, logo, footer). No Word export mentioned for Artidoc. — [help.tuleap.com, What is Artidoc](https://help.tuleap.com/docs/en/what-is-artidoc)
- **[V-snippet]** Artidoc document versions: the docs describe viewing versions as an "experimental" setting that "can therefore still evolve". A Tuleap tracker story describes a prototype where document history is derived from the changesets of the member artifacts, with "no explicit data recorded in database related to versions" at that stage. — [help.tuleap.com, Artidoc](https://help.tuleap.com/docs/en/artidoc-1); [tuleap.net story aid=44470](https://tuleap.net/plugins/tracker/?aid=44470)
- **[V-snippet]** Section edits in Artidoc are saved as a new changeset of the underlying artifact. — [Tuleap 15.10 release notes](https://help.tuleap.com/docs/tuleap-15-10.md)
- **[V-fetched]** Marketing claims for requirements: full history, "compare requirement versions at a glance", cross-tracker queries to find links between requirements, tests and subsystems, PDF export for audits, comment and approve requirements. The page does not mention a traceability matrix, coverage metrics or gap analysis. — [tuleap.com, Requirements management](https://www.tuleap.com/product/features/requirement-baseline)
- **[V-snippet]** A Tuleap guide says requirement-to-test links "are formalized in a traceability matrix". — [tuleap.com guide](https://www.tuleap.com/?p=262141)
- **[V-fetched]** Artifact IDs are a single platform-wide number, as seen in Tuleap's own tracker URLs (`?aid=44470`, `?aid=21334`). — [tuleap.net aid=44470](https://tuleap.net/plugins/tracker/?aid=44470)
- **[V-fetched]** document_generation exports tracker reports to docx and xlsx. — [docs.tuleap.com, Plugins installation](https://docs.tuleap.com/installation-guide/step-by-step/install-plugins.html)

### Inferences
Feature-by-feature against the founder's planned scope (inference from the findings above unless a source is cited there):

| Capability | Tuleap status | Confidence |
|---|---|---|
| Versioned items with history | Yes, per-artifact changesets | High |
| Word-level diff between versions | Version comparison is claimed; granularity not confirmed | Low |
| Immutable baseline of a document | Weak. Baseline snapshots a backlog milestone, a limited field set, and is beta. No evidence it baselines an Artidoc document | Medium |
| Baseline comparison | Yes, between two baselines of one milestone | High |
| Suspect-link flagging | No evidence found in any vendor page | Medium (absence of evidence) |
| Traceability matrix between two sets | Not a named feature on the product page; achieved through cross-tracker queries and test coverage views | Medium |
| Coverage reports | Requirement-to-test coverage shown via Test Management (paid) | Medium |
| Stable per-document UIDs (SYS-042) | No. One global artifact number | High for the global number; no evidence of a per-tracker human ID |
| Rich text with images | Yes | High |
| Rich text with tables | Not confirmed | Low |
| Reviews with sign-off | Workflow status transitions and comments; no formal review or e-signature module found | Medium |
| ReqIF | No evidence | Medium |

- The baseline model is tied to Agile planning (milestones and backlogs). A team that writes specifications as documents, not sprints, has to bend its process to get a baseline. This is a real conceptual mismatch for defence and medical document-centric work.
- Tuleap is moving toward the founder's design: Artidoc is explicitly meant to become the base of its requirements management. The gap is closing, and it is being closed inside the paid edition.

### Gaps
- The artifact-links documentation page returned 404, so link types ("natures" such as parent/child, covered-by), custom link types and any impact flagging could not be read first-hand.
- Whether Baseline is immutable in the strict sense (cannot be edited or deleted) is not stated in the docs page.
- Whether Artidoc documents can be baselined, and whether version comparison is word-level, could not be confirmed.

## 3. Installation and operation

### Takeaway
Installation is narrow and demanding compared with a single app image plus Postgres: RPM install supports only Enterprise Linux 9, requires a dedicated server, SELinux disabled, a dedicated MySQL 8.4 and an Internet connection. The documented production Docker image is for Enterprise subscribers only, pulled from a private registry.

### Cited Findings
- **[V-fetched]** Supported OS: Linux x86_64, "Enterprise Linux 9 (RHEL, Rocky, Alma Linux 9)". — [docs.tuleap.com, Requirements](https://docs.tuleap.com/installation-guide/step-by-step/requirements.html)
- **[V-fetched]** "You must disable SELinux" before installing. Use a "fully dedicated server"; do not co-host other applications. — [docs.tuleap.com, Requirements](https://docs.tuleap.com/installation-guide/step-by-step/requirements.html)
- **[V-fetched]** Database must be MySQL 8.4, dedicated to Tuleap; "shared databases must not be used". — [docs.tuleap.com, Requirements](https://docs.tuleap.com/installation-guide/step-by-step/requirements.html); [docs.tuleap.com, Tuleap on Docker](https://docs.tuleap.com/installation-guide/docker/intro_docker.html)
- **[V-fetched]** The server needs an Internet connection because the installer downloads external packages. — [docs.tuleap.com, Requirements](https://docs.tuleap.com/installation-guide/step-by-step/requirements.html)
- **[V-fetched]** Step-by-step install is: requirements, dependencies, packages, database, setup, TLS, mail, Valkey, first connection, plugins, upgrade. The docs warn "Installation can be tricky for linux beginners". Docker is "Recommended way to install Tuleap, especially for tests". — [docs.tuleap.com, Install](https://docs.tuleap.com/install.html)
- **[V-fetched]** "The Tuleap docker images allow you to test Tuleap quickly by skipping the installation and customization part." — [docs.tuleap.com, Docker introduction](https://docs.tuleap.com/installation-guide/docker/introduction.html)
- **[V-fetched]** The Docker Compose page covers the Enterprise image only: "This image is only available to Tuleap Enterprise subscribers"; requires `docker login docker.tuleap.org`; needs external MySQL, Redis/Valkey and a mail relay; a reverse proxy for TLS; publishes ports 80, 443 and 22. — [docs.tuleap.com, Docker Compose](https://docs.tuleap.com/installation-guide/docker/docker_compose.html); [docs.tuleap.com, Tuleap on Docker](https://docs.tuleap.com/installation-guide/docker/intro_docker.html)
- **[3P, snippet]** Review complaints about operations: "the Docker images of Tuleap are not tagged", making rollback hard; difficulties running on Kubernetes; logs "not very informative" even for administrators. — [Capterra, Tuleap reviews](https://www.capterra.com/p/175234/Tuleap/reviews/); [G2, Tuleap reviews](https://www.g2.com/products/tuleap/reviews)

### Inferences
- Air-gapped installation is not a documented path: the requirements page says Internet access is needed. Defence subcontractors on isolated networks would need a local RPM mirror or Enalean's help. An offline-installable single image is a concrete advantage.
- Disabling SELinux is a red flag for security-audited environments (defence, medical IT).
- Tuleap needs MySQL, Valkey/Redis, a mail relay, a reverse proxy and SSH exposure. That is a platform, not an app. For a five-person team it is a heavy footprint.

### Gaps
- CPU, RAM and disk requirements are not stated on the requirements page.
- Upgrade procedure details and how long an upgrade takes were not read.
- No source was found for how long setup and tracker configuration takes a new team. No number can be given.
- Whether the Community Docker image is supported for production is not explicitly stated either way; the wording points to testing.

## 4. Pricing

### Takeaway
Public cloud prices are 13 EUR per user per month (myTuleap, capped at 30 users) and 25 EUR per user per month (Premium Cloud, sold in a 25-user pack, so about 7,500 EUR a year minimum). On-premises Enterprise pricing is quote-only; third-party listings disagree (8, 16 and 23 EUR per user per month).

### Cited Findings
- **[V-snippet]** myTuleap: Tuleap Enterprise in SaaS, 13 EUR per user per month, billed annually, excl. VAT, up to 30 users, "web-exclusive". — [tuleap.com pricing](https://www.tuleap.com/pricing/) (the fetched copy of this page showed no prices; figures come from the search summary and match a third-party listing)
- **[V-snippet]** Premium Cloud: 25 EUR per user per month, billed annually, excl. VAT, "Pack 25 users", starts at 25 users, special pricing from 50 users; includes SLA on continuity and disaster recovery, Level 2 expert support, SSO/OpenID Connect. — [tuleap.com pricing](https://www.tuleap.com/pricing/)
- **[3P]** Softwarefinder (updated 2025-09-17) lists the same cloud figures: 13 EUR and 25 EUR per user per month, discounts at 50+ users. — [softwarefinder.com](https://softwarefinder.com/project-management-software/tuleap)
- **[V-fetched]** On-premises and tailored plans are by quote: a Tuleap team recommends a plan from user count, hosting and support expectations. — [tuleap.com, start now](https://www.tuleap.com/start-now/)
- **[3P, snippet]** A reseller-style listing gives "Expert (on-premise)" at 23 EUR per user per month, pack of 25 users, billed annually, with premium support, monthly updates, guaranteed response times, unlimited tickets, SSO/OIDC. — [fitgap.com](https://us.fitgap.com/products/tuleap) (page returned HTTP 410 on direct fetch; unverified)
- **[3P, snippet]** Conflicting figures: Capterra/GetApp list "Tuleap Expert - On-premises" at 8 EUR per user per month; G2 lists Cloud Premium at 16 EUR per user per month for 200 users. — [Capterra pricing](https://www.capterra.com/p/175234/Tuleap/pricing/); [G2 pricing](https://g2.com/products/tuleap/pricing)

### Inferences
- Arithmetic: 25 users x 25 EUR x 12 = 7,500 EUR a year as the Premium Cloud entry point; 30 users x 13 EUR x 12 = 4,680 EUR a year as the myTuleap ceiling. A 5-person team on myTuleap would pay about 780 EUR a year if there is no minimum (minimum not confirmed).
- On price alone Tuleap is not expensive. myTuleap at 13 EUR per user is far below Jama. A new competitor cannot win on "cheaper than Tuleap cloud"; it has to win on fit (document-first RM, free self-hosting with the RM features included, simple install).
- The 25-user pack is a poor fit for teams of 3 to 10 that need SSO or on-premises support.

### Gaps
- Official on-premises price, user-pack minimum for on-premises, and standalone support pricing: not published, not confirmed.
- Whether myTuleap has a minimum user count: not confirmed.
- Whether myTuleap is hosted in a way acceptable to defence customers (data residency, export control): not researched.

## 5. User complaints and praise

### Takeaway
Public review volume is small (about 20 on G2, 37 on Capterra) and mostly positive: 4.5/5 on Capterra, 4.2/5 on G2. Praise centres on configurability; complaints centre on learning curve, operations (Docker tagging, Kubernetes, uninformative logs), limited test steps, integrations and a missing whole-project baseline. No strong "dated UI" theme could be verified.

### Cited Findings
- **[3P, snippet]** Capterra: 4.5 overall from 37 reviews; ease of use 4.3; customer service 4.6. — [Capterra, Tuleap reviews](https://www.capterra.com/p/175234/Tuleap/reviews/)
- **[V-fetched]** Tuleap's own site quotes Capterra 4.5/5 and G2 4.2/5. — [tuleap.com pricing page](https://www.tuleap.com/pricing/)
- **[3P, snippet]** G2 summary: the interface "can be complex for newcomers, requiring guidance". This reads as a platform-generated summary, not a user quote. — [G2, Tuleap](https://www.g2.com/products/tuleap)
- **[3P, snippet]** G2 comparison: ease-of-use 8.1 for Tuleap vs 8.6 for Asana; mixed feedback on drag and drop. — [G2, Asana vs Tuleap](https://www.g2.com/compare/asana-vs-tuleap)
- **[3P, snippet]** Complaints: Docker images not tagged; trouble on Kubernetes; logs not informative; test tool "sufficient but too limited on the steps"; integration could be easier; baseline for a whole project and documentation at milestones missing (late 2025). — [G2, Tuleap reviews](https://www.g2.com/products/tuleap/reviews); [Capterra, Tuleap reviews](https://www.capterra.com/p/175234/Tuleap/reviews/)
- **[3P, snippet]** Praise: quick autonomy in configuring one's own forms; workflows that match exact needs; support and documentation. A 2020 GetApp reviewer: "very easy to put in place, to use and to customize"; another: learning curve "quite tough at the beginning". — [G2, Tuleap reviews](https://www.g2.com/products/tuleap/reviews); [GetApp, Tuleap](https://www.getapp.ca/software/2075657/tuleap)

### Inferences
- The founder should not build a pitch on "Tuleap is hated". The evidence does not support that. The supportable pitch is "Tuleap is a broad ALM platform you must configure; this is a focused RM tool that works on day one".
- The low review count (under 60 across the two main sites after 15 years) suggests a small, mostly French and enterprise-sales-driven customer base rather than broad bottom-up adoption.

### Gaps
- G2 and Capterra pages returned 403; no review was read first-hand, and reviewer roles, company sizes and dates could not be captured.
- No Reddit, Hacker News, TrustRadius or SourceForge commentary was found. That absence is itself a signal of low mindshare outside France, but it is not proof.
- No evidence was gathered on performance complaints.

## 6. Adoption, company size, cadence

### Takeaway
Enalean is a small company (about 20 employees, founded 2011, French Alps) that now states it has joined Dassault Systèmes and the CATIA organisation. That changes the competitive picture: Tuleap gains a very large industrial sales channel in aerospace and defence, and its independence and open-source direction become uncertain.

### Cited Findings
- **[V-fetched]** Enalean is "an independent company founded in 2011", head office in Saint-Alban-Leysse near Chambéry. The same page states Enalean has joined Dassault Systèmes and the CATIA organisation; no date given. — [tuleap.com, About Tuleap](https://www.tuleap.com/about-tuleap/)
- **[3P, snippet]** Search results summarise an announcement that Dassault Systèmes acquired Enalean to strengthen CATIA's model-based systems engineering, targeting aerospace and defence, transportation and mobility, and high-tech; CATIA CEO Olivier Sappin is quoted. Sources are LinkedIn reposts of a press release; date and terms not found. — [3ds.com, CATIA systems engineering](https://www.3ds.com/products/catia/systems-engineering?wocset=2)
- **[V-fetched]** An earlier, undated Tuleap article describes a partnership: Dassault Systèmes "does not have an ALM itself"; "Tuleap is aimed for mostly industrial software". — [tuleap.com, Tuleap and Dassault Systèmes](https://www.tuleap.com/tuleap-and-dassault-systemes-a-collaboration-between-alm-and-plm-to-revolutionize-product-development)
- **[3P]** Latka estimates about 2.4M USD revenue in 2025 with a 22-person team (CEO Laurent Charles). Estimate, not filed accounts. — [getlatka.com](https://getlatka.com/companies/tuleap.org)
- **[3P]** A French business-press article (about 2017) gives Enalean 20 employees and names Thales, STMicroelectronics, Orange, Airbus and CEA as large accounts won with partner Sogilis. Old; may not be current. — [Le Journal des Entreprises](https://www.lejournaldesentreprises.com/article/alliance-entre-sogilis-et-enalean-56998)
- **[V-fetched]** Customer stories on the requirements page: Softway Medical (300 people, ISO 13485), Vignal Group (IATF, automotive lighting), Enchanted Tools (robotics), Insee (French statistics office, agile use). — [tuleap.com, Requirements management](https://www.tuleap.com/product/features/requirement-baseline)
- **[V-fetched]** Vendor has industry pages for automotive, aerospace and defence, public sector, healthcare and medical devices, and electronics/robotics/semiconductors. — [tuleap.com, About Tuleap](https://www.tuleap.com/about-tuleap/)
- **[V-snippet]** Release notes exist for 15.10, 16.2, 16.3 (titled January 2025), 16.6 and 16.12, and a reseller listing mentions "monthly updates". — [help.tuleap.com release notes](https://help.tuleap.com/docs/tuleap-16-3.md)

### Inferences
- Release cadence is roughly monthly (inferred from version numbering and the "monthly updates" claim; not stated by the vendor on a fetched page).
- The Dassault move cuts both ways for the founder. Against: Tuleap will be bundled into 3DEXPERIENCE deals at primes and large suppliers. For: small subcontractors and medical startups are not Dassault's sales target, an acquired open-source product often sees its community edition deprioritised, and "independent, AGPL, not owned by a PLM giant" becomes a real selling point. The second half is speculation about the future, not a finding.
- No named defence or aerospace customer is published by the vendor today; the Airbus and Thales names come from a 2017 article.

### Gaps
- Acquisition date, terms, and any statement about the future of the Community Edition or GPL licence: not found. Check the Dassault Systèmes newsroom.
- Filed revenue and headcount (Infogreffe): not checked.
- Number of outside code contributors: not found. Not confirmed.
- Number of customers or users: not published on the pages read.

## 7. Compliance marketing

### Takeaway
Tuleap's compliance claims are general: "designed to meet" ISO 26262, ASPICE and DO-178C, with ISO 13485 and IATF appearing only in customer stories. No claim was found for IEC 62304 or 21 CFR Part 11, no electronic-signature feature, and no validation package (IQ/OQ/PQ).

### Cited Findings
- **[V-fetched]** FAQ: Tuleap "is designed to meet the requirements of the most demanding standards (ISO 26262, ASPICE, DO-178C, etc.)". — [tuleap.com, Requirements management](https://www.tuleap.com/product/features/requirement-baseline)
- **[V-fetched]** ISO 13485 and IATF appear only in customer-story titles (Softway Medical, Vignal). IEC 62304 and 21 CFR Part 11 are not mentioned on the page. — [tuleap.com, Requirements management](https://www.tuleap.com/product/features/requirement-baseline)
- **[V-fetched]** "Prepare your audits with live documents, traceability reports, and automated documentation, ready to export"; everything exportable to PDF for audits. — [tuleap.com, Requirements management](https://www.tuleap.com/product/features/requirement-baseline)
- **[V-snippet]** Marketing: "Tuleap ensures full traceability and helps you meet quality standards (ISO, IEC, etc.)". — [tuleap.com guide](https://www.tuleap.com/?p=262141)
- **[V-fetched]** The About page lists no certifications (no ISO 27001 mention on that page). — [tuleap.com, About Tuleap](https://www.tuleap.com/about-tuleap/)
- A targeted search for Tuleap with "21 CFR Part 11", "IEC 62304" or "electronic signature" returned nothing about Tuleap (results were about the unrelated product Tulip). — [search result example, tulip.co](https://tulip.co/blog/manufacturers-guide-to-21-cfr-part-11-compliance/)

### Inferences
- For small medical device teams, Tuleap offers no visible Part 11 story: no e-signature, no validation kit. Commercial RM tools (Jama, Matrix Requirements, Helix ALM) sell exactly that. A competitor that ships signed reviews, an append-only audit log and a validation document pack would be ahead of Tuleap in this segment. This rests on absence of evidence in public material; Enalean may supply such documents under NDA.
- Tuleap's compliance position is strongest in automotive and embedded software (ISO 26262, ASPICE), which matches its customer stories.

### Gaps
- Whether Enalean provides a validation package or tool qualification kit (DO-330, ISO 26262-8 tool confidence) to paying customers: not found, not confirmed.
- The vendor's Security page and industry pages (aerospace and defence, medical devices) were not read; they may contain further claims.
