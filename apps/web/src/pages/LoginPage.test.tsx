import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserRouter } from "react-router";
import { App } from "@/App";

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  window.history.pushState({}, "", path);
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("login form", () => {
  it("exposes a stable username and password form", () => {
    renderAt("/login");
    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    expect(username).toHaveAttribute("id", "username");
    expect(username).toHaveAttribute("name", "username");
    expect(password).toHaveAttribute("id", "password");
    expect(password).toHaveAttribute("name", "password");
    expect(password).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Log in" })).toHaveAttribute("type", "submit");
  });
});
