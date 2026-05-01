/**
 * Custom render utility that wraps components in all required providers.
 * Use this instead of @testing-library/react's render() in all tests.
 */
import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  /** Initial route entries for MemoryRouter */
  route?: string;
  routerProps?: Omit<MemoryRouterProps, "children">;
  /** Override QueryClient for specific test scenarios */
  queryClient?: QueryClient;
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  {
    route = "/",
    routerProps,
    queryClient,
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  const testQueryClient = queryClient ?? createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={testQueryClient}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[route]} {...routerProps}>
            {children}
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient: testQueryClient,
  };
}

export { createTestQueryClient };
