import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { ApiDocsPage } from "./ApiDocs.tsx";
import { BaselinePage, BaselinesPage } from "./BaselinePages.tsx";
import { ImpactPage } from "./ImpactPage.tsx";
import { IntegrationsPage } from "./IntegrationsPage.tsx";
import { ItemPage } from "./ItemPage.tsx";
import { MatrixPage } from "./MatrixPage.tsx";
import { ProjectHome, ProjectPage } from "./ProjectPage.tsx";
import { ProjectsPage } from "./ProjectsPage.tsx";
import { ReportsPage } from "./ReportsPage.tsx";
import { ReqifImportPage } from "./Reqif.tsx";
import { ReviewPage, ReviewsPage } from "./ReviewPages.tsx";
import { Root } from "./Root.tsx";
import { SearchPage } from "./SearchPage.tsx";
import { FolderPage, SetPage } from "./SetView.tsx";
import { SuspectPage } from "./SuspectPage.tsx";
import { ActivityPage, MembersPage } from "./TeamPages.tsx";
import { TestCyclePage, TestPlanPage, TestPlansPage, TestRunPage } from "./TestPages.tsx";
import { TrashPage } from "./TrashPage.tsx";
import { TypesPage } from "./TypesPage.tsx";
import { InvitePage, ResetPasswordPage, UsersPage } from "./UsersPage.tsx";

const rootRoute = createRootRoute({ component: Root });
const projectsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ProjectsPage });
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects/$projectId",
  component: ProjectPage,
});
const apiDocsRoute = createRoute({ getParentRoute: () => rootRoute, path: "api-docs", component: ApiDocsPage });
const usersRoute = createRoute({ getParentRoute: () => rootRoute, path: "users", component: UsersPage });
const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "invite/$token", component: InvitePage });
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "reset-password/$token",
  component: ResetPasswordPage,
});
const inProject = { getParentRoute: () => projectRoute };
const level = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4 ? value : undefined;
// List view is the default; ?view=reading shows the Reading view and ?view=trace the Trace view.
// The Trace view keeps its levels and coverage target in the URL, so a trace can be shared as a link.
const viewSearch = (
  search: Record<string, unknown>,
): {
  view?: "reading" | "trace";
  up?: number;
  down?: number;
  target?: string;
  linkType?: string;
  baseline?: string;
  status?: string;
} => ({
  view: search.view === "reading" || search.view === "trace" ? search.view : undefined,
  up: level(search.up),
  down: level(search.down),
  target: typeof search.target === "string" ? search.target : undefined,
  linkType: typeof search.linkType === "string" ? search.linkType : undefined,
  baseline: typeof search.baseline === "string" ? search.baseline : undefined,
  status: typeof search.status === "string" ? search.status : undefined,
});
const projectChildren = [
  createRoute({ ...inProject, path: "/", component: ProjectHome }),
  createRoute({ ...inProject, path: "sets/$setId", component: SetPage, validateSearch: viewSearch }),
  createRoute({ ...inProject, path: "folders/$nodeId", component: FolderPage, validateSearch: viewSearch }),
  createRoute({ ...inProject, path: "items/$nodeId", component: ItemPage }),
  createRoute({ ...inProject, path: "items/$nodeId/impact", component: ImpactPage }),
  createRoute({ ...inProject, path: "members", component: MembersPage }),
  createRoute({ ...inProject, path: "types", component: TypesPage }),
  createRoute({ ...inProject, path: "integrations", component: IntegrationsPage }),
  createRoute({ ...inProject, path: "activity", component: ActivityPage }),
  createRoute({ ...inProject, path: "trash", component: TrashPage }),
  createRoute({ ...inProject, path: "suspect", component: SuspectPage }),
  createRoute({ ...inProject, path: "baselines", component: BaselinesPage }),
  createRoute({ ...inProject, path: "baselines/$baselineId", component: BaselinePage }),
  createRoute({ ...inProject, path: "import", component: ReqifImportPage }),
  createRoute({ ...inProject, path: "reviews", component: ReviewsPage }),
  createRoute({ ...inProject, path: "reviews/$reviewId", component: ReviewPage }),
  createRoute({ ...inProject, path: "test-plans", component: TestPlansPage }),
  createRoute({ ...inProject, path: "test-plans/$testPlanId", component: TestPlanPage }),
  createRoute({ ...inProject, path: "cycles/$testCycleId", component: TestCyclePage }),
  createRoute({ ...inProject, path: "runs/$testRunId", component: TestRunPage }),
  createRoute({ ...inProject, path: "reports", component: ReportsPage }),
  createRoute({
    ...inProject,
    path: "search",
    component: SearchPage,
    validateSearch: (search): { q?: string } => ({ q: typeof search.q === "string" ? search.q : undefined }),
  }),
  createRoute({
    ...inProject,
    path: "matrix",
    component: MatrixPage,
    // Which sets the matrix shows; kept in the URL so a matrix can be shared as a link.
    validateSearch: (search): { rows?: string; cols?: string } => ({
      rows: typeof search.rows === "string" ? search.rows : undefined,
      cols: typeof search.cols === "string" ? search.cols : undefined,
    }),
  }),
];

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    projectsRoute,
    usersRoute,
    apiDocsRoute,
    inviteRoute,
    resetRoute,
    projectRoute.addChildren(projectChildren),
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
