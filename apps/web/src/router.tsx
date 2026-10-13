import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { BaselinePage, BaselinesPage } from "./BaselinePages.tsx";
import { ItemPage } from "./ItemPage.tsx";
import { MatrixPage } from "./MatrixPage.tsx";
import { ProjectHome, ProjectPage } from "./ProjectPage.tsx";
import { ProjectsPage } from "./ProjectsPage.tsx";
import { Root } from "./Root.tsx";
import { SearchPage } from "./SearchPage.tsx";
import { FolderPage, SetPage } from "./SetView.tsx";
import { ActivityPage, MembersPage } from "./TeamPages.tsx";
import { InvitePage, UsersPage } from "./UsersPage.tsx";

const rootRoute = createRootRoute({ component: Root });
const projectsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ProjectsPage });
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects/$projectId",
  component: ProjectPage,
});
const usersRoute = createRoute({ getParentRoute: () => rootRoute, path: "users", component: UsersPage });
const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "invite/$token", component: InvitePage });
const inProject = { getParentRoute: () => projectRoute };
// List view is the default; ?view=reading shows the Reading view.
const viewSearch = (search: Record<string, unknown>): { view?: "reading" } => ({
  view: search.view === "reading" ? "reading" : undefined,
});
const projectChildren = [
  createRoute({ ...inProject, path: "/", component: ProjectHome }),
  createRoute({ ...inProject, path: "sets/$setId", component: SetPage, validateSearch: viewSearch }),
  createRoute({ ...inProject, path: "folders/$nodeId", component: FolderPage, validateSearch: viewSearch }),
  createRoute({ ...inProject, path: "items/$nodeId", component: ItemPage }),
  createRoute({ ...inProject, path: "members", component: MembersPage }),
  createRoute({ ...inProject, path: "activity", component: ActivityPage }),
  createRoute({ ...inProject, path: "baselines", component: BaselinesPage }),
  createRoute({ ...inProject, path: "baselines/$baselineId", component: BaselinePage }),
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
  routeTree: rootRoute.addChildren([projectsRoute, usersRoute, inviteRoute, projectRoute.addChildren(projectChildren)]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
