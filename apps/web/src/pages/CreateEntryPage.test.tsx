import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router";
import { App } from "@/App";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function renderApp(path: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/admin/session")) {
        return json({ authenticated: true });
      }
      return json({ error: "not_found", message: "missing" }, 404);
    }),
  );
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
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("create forms", () => {
  it("keeps the create-artist fields stable", async () => {
    renderApp("/");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create artist" }));

    const name = screen.getByLabelText("Name");
    expect(name).toHaveAttribute("id", "name");
    expect(name).toHaveAttribute("name", "name");
    expect(screen.getByRole("button", { name: "Create artist" })).toHaveAttribute("type", "submit");
    expect(window.location.pathname).toBe("/artists/new");
  });

  it("keeps the create-entry fields stable", async () => {
    renderApp("/artists/A0001/entries/new");

    const firstName = await screen.findByLabelText("First name");
    const lastName = screen.getByLabelText("Last name");
    const address = screen.getByLabelText("Address");
    const image = screen.getByLabelText("Image");

    expect(firstName).toHaveAttribute("id", "firstName");
    expect(firstName).toHaveAttribute("name", "firstName");
    expect(lastName).toHaveAttribute("id", "lastName");
    expect(lastName).toHaveAttribute("name", "lastName");
    expect(address).toHaveAttribute("id", "address");
    expect(address).toHaveAttribute("name", "address");
    expect(image).toHaveAttribute("id", "image");
    expect(image).toHaveAttribute("name", "image");
    expect(image).toHaveAttribute("type", "file");
    expect(screen.getByRole("button", { name: "Create entry" })).toHaveAttribute("type", "submit");
  });
});
