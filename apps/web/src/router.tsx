import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { ItemPage } from "./ItemPage.tsx";
import { MatrixPage } from "./MatrixPage.tsx";
import { FolderPage, ProjectHome, ProjectPage, SetPage } from "./ProjectPage.tsx";
import { ProjectsPage } from "./ProjectsPage.tsx";
import { Root } from "./Root.tsx";

const rootRoute = createRootRoute({ component: Root });
const projectsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ProjectsPage });
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects/$projectId",
  component: ProjectPage,
});
const inProject = { getParentRoute: () => projectRoute };
const projectChildren = [
  createRoute({ ...inProject, path: "/", component: ProjectHome }),
  createRoute({ ...inProject, path: "sets/$setId", component: SetPage }),
  createRoute({ ...inProject, path: "folders/$nodeId", component: FolderPage }),
  createRoute({ ...inProject, path: "items/$nodeId", component: ItemPage }),
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
  routeTree: rootRoute.addChildren([projectsRoute, projectRoute.addChildren(projectChildren)]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
