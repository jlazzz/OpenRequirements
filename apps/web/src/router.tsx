import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { ProjectHome, ProjectPage, SetPage } from "./ProjectPage.tsx";
import { ProjectsPage } from "./ProjectsPage.tsx";
import { Root } from "./Root.tsx";

const rootRoute = createRootRoute({ component: Root });
const projectsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ProjectsPage });
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "projects/$projectId",
  component: ProjectPage,
});
const projectHomeRoute = createRoute({ getParentRoute: () => projectRoute, path: "/", component: ProjectHome });
const setRoute = createRoute({ getParentRoute: () => projectRoute, path: "sets/$setId", component: SetPage });

export const router = createRouter({
  routeTree: rootRoute.addChildren([projectsRoute, projectRoute.addChildren([projectHomeRoute, setRoute])]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
