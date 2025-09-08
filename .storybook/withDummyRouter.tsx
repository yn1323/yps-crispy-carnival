import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
// biome-ignore lint/correctness/noUnusedImports: temp
import React, { createContext, type ReactNode, useContext } from "react";

const StoryContext = createContext<(() => ReactNode) | undefined>(undefined);
const RenderStory = () => {
  const storyFn = useContext(StoryContext);
  if (!storyFn) {
    throw new Error("Storybook root not found");
  }
  return storyFn();
};

// List the paths of your application
const paths = ["/", "/about", "/paths"];
const routes = paths.map((path) =>
  createRoute({
    path,
    getParentRoute: () => rootRoute,
    component: RenderStory,
  }),
);

const rootRoute = createRootRoute();
rootRoute.addChildren(routes);
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
