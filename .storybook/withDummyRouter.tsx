import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, type ReactNode, useContext } from "react";

const StoryContext = createContext<(() => ReactNode) | undefined>(undefined);
const RenderStory = () => {
  const storyFn = useContext(StoryContext);
  if (!storyFn) {
    throw new Error("Storybook root not found");
  }
  return storyFn();
};

const rootRoute = createRootRoute();

// List the paths of your application
const paths = ["/", "/about", "/paths"];
const staticRoutes = paths.map((path) =>
  createRoute({
    path,
    getParentRoute: () => rootRoute,
    component: RenderStory,
  }),
);

// Catch-all route for any other paths (e.g., /shops/$shopId)
const catchAllRoute = createRoute({
  path: "$",
  getParentRoute: () => rootRoute,
  component: RenderStory,
});

rootRoute.addChildren([...staticRoutes, catchAllRoute]);
const storyRouter = createRouter({
  history: createMemoryHistory({ initialEntries: ["/"] }),
  routeTree: rootRoute,
});

/** StoryBook用ダミーRouter */
export const withDummyRouter = (initialPath: (typeof paths)[number]) => (storyFn: () => ReactNode) => {
  storyRouter.history.push(initialPath);
  return (
    <StoryContext.Provider value={storyFn}>
      <RouterProvider router={storyRouter} />
    </StoryContext.Provider>
  );
};
