import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { ItemPage } from "./ItemPage.tsx";
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
];

export const router = createRouter({
  routeTree: rootRoute.addChildren([projectsRoute, projectRoute.addChildren(projectChildren)]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
