import "@mantine/core/styles.css";
import "./print.css";
import { createTheme, MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router.tsx";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const theme = createTheme({ primaryColor: "blue", defaultRadius: "sm" });

// Printing, which is also saving as PDF, is always on a white page, whatever the screen shows.
const root = document.documentElement;
let screenScheme: string | null = null;
window.addEventListener("beforeprint", () => {
  screenScheme = root.getAttribute("data-mantine-color-scheme");
  root.setAttribute("data-mantine-color-scheme", "light");
});
window.addEventListener("afterprint", () => {
  if (screenScheme) root.setAttribute("data-mantine-color-scheme", screenScheme);
});

// biome-ignore lint/style/noNonNullAssertion: index.html always has #root
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
