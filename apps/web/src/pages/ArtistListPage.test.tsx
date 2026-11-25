import type { Artist, ArtistDetail, Entry } from "@records/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, useNavigate } from "react-router";
import type { ArtistListViewProps } from "@/components/ArtistListView";
import { App } from "@/App";

const artistRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/hooks/useArtists", async () => {
  const actual = (await vi.importActual("@/hooks/useArtists")) as {
    useArtists: () => ArtistListViewProps;
  };
  return {
    useArtists: () => {
      artistRenders.count += 1;
      return actual.useArtists();
    },
  };
});

function SameRouteProbe() {
  const navigate = useNavigate();
  const [ticks, setTicks] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTicks((value) => value + 1);
        }}
      >
        Rerender
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate("/");
        }}
      >
        Same route
      </button>
      <output>{ticks}</output>
      <App />
    </>
  );
}

const artist: Artist = {
  id: "A0001",
  name: "Ada Lovelace",
  createdAt: "2026-11-25T05:48:00.000Z",
};

const entry: Entry = {
  id: "4f3b1c0a-6d2e-4a1b-8c3d-9e0f1a2b3c4d",
  artistId: "A0001",
  firstName: "Ada",
  lastName: "Lovelace",
  address: "London",
  image: { filename: "portrait.png", mimeType: "image/png", sizeBytes: 68 },
  createdAt: "2026-11-25T05:48:00.000Z",
};

const detail: ArtistDetail = { artist, entries: [entry] };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/admin/session")) {
        return json({ authenticated: true });
      }
      if (url.endsWith(`/api/entries/${entry.id}`)) {
        return json(entry);
      }
      if (url.endsWith(`/api/artists/${artist.id}`)) {
        return json(detail);
      }
      if (url.endsWith("/api/artists")) {
        return json({ artists: [artist] });
      }
      if (url.includes("/api/entry-requests") && !url.includes("/api/entry-requests/")) {
        return json({ requests: [] });
      }
      return json({ error: "not_found", message: "missing" }, 404);
    }),
  );
}

function renderApp(path: string) {
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

describe("artist list navigation", () => {
  it("opens the artist from the name link and shows the assigned id", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp("/");

    await user.click(await screen.findByRole("link", { name: "Ada Lovelace" }));

    expect(await screen.findByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText("A0001")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/artists/A0001");
  });

  it("opens the artist from a left-click or Enter on the row", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp("/");

    await user.click(await screen.findByText("A0001"));
    expect(await screen.findByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/artists/A0001");

    await user.click(screen.getByRole("button", { name: "Back to artists" }));
    await screen.findByRole("heading", { name: "Artists" });

    const row = screen.getByRole("row", { name: /A0001/ });
    row.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/artists/A0001");
  });

  it("returns to the artists list from Back to artists without leaving the session", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp("/artists/A0001");

    const back = await screen.findByRole("button", { name: "Back to artists" });
    expect(back).toHaveAttribute("type", "button");
    await user.click(back);

    expect(await screen.findByRole("heading", { name: "Artists" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Log in" })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("shows Back to artists when the artist is missing and returns to the list", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp("/artists/A9999");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to artists" }));

    expect(await screen.findByRole("heading", { name: "Artists" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("returns to the artists list from the create-entry page", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp("/artists/A0001/entries/new");

    await user.click(await screen.findByRole("button", { name: "Back to artists" }));

    expect(await screen.findByRole("heading", { name: "Artists" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("returns to the artist from Back to artist on the entry page", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp(`/artists/A0001/entries/${entry.id}`);

    const back = await screen.findByRole("button", { name: "Back to artist" });
    expect(back).toHaveAttribute("type", "button");
    await user.click(back);

    expect(await screen.findByRole("button", { name: "Create entry" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Log in" })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/artists/A0001");
  });

  it("shows Back to artist when the entry is missing and returns to that artist", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp("/artists/A0001/entries/00000000-0000-4000-8000-000000000000");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const back = screen.getByRole("button", { name: "Back to artist" });
    expect(back).toHaveAttribute("type", "button");
    await user.click(back);

    expect(await screen.findByRole("button", { name: "Create entry" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/artists/A0001");
  });

  it("does not keep rendering after a same-route navigation", async () => {
    installFetch();
    artistRenders.count = 0;
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    window.history.pushState({}, "", "/");
    render(
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <SameRouteProbe />
        </BrowserRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "Artists" });
    await user.click(screen.getByRole("button", { name: "Rerender" }));
    await user.click(screen.getByRole("button", { name: "Same route" }));
    const settled = artistRenders.count;
    await new Promise((resolve) => {
      setTimeout(resolve, 80);
    });

    expect(artistRenders.count - settled).toBeLessThan(8);
    expect(screen.getByRole("heading", { name: "Artists" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Artists" })).not.toBeInTheDocument();
  });

  it("opens a pending LLM entry request and shows the review buttons", async () => {
    const request = {
      id: "6b7c8d9e-1f2a-4b3c-8d4e-5f6a7b8c9d0e",
      artistId: "A0001",
      artistName: "Ada Lovelace",
      firstName: "Grace",
      lastName: "Hopper",
      address: "1 Navy Way",
      image: { filename: "portrait.png", mimeType: "image/png", sizeBytes: 68 },
      sourceSubmissionId: "submission-1",
      llmNotes: "Matched the record id.",
      status: "pending",
      createdAt: "2026-11-25T06:00:00.000Z",
      decidedAt: null,
      createdEntryId: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("/api/admin/session")) {
          return json({ authenticated: true });
        }
        if (url.includes("/api/entry-requests/")) {
          return json(request);
        }
        if (url.includes("/api/entry-requests")) {
          return json({ requests: [request] });
        }
        if (url.endsWith("/api/artists")) {
          return json({ artists: [artist] });
        }
        return json({ error: "not_found", message: "missing" }, 404);
      }),
    );
    const user = userEvent.setup();
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Entry requests from LLM" })).toBeInTheDocument();
    const requestLink = await screen.findByRole("link", { name: "Grace Hopper" });
    expect(screen.getByLabelText("1 pending")).toHaveTextContent("1");
    await user.click(requestLink);

    expect(await screen.findByRole("button", { name: "Verified" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByText("Matched the record id.")).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/entry-requests/${request.id}`);

    await user.click(screen.getByRole("button", { name: "Back to artists" }));
    expect(await screen.findByRole("heading", { name: "Artists" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("opens an entry from the artist's entry list", async () => {
    installFetch();
    const user = userEvent.setup();
    renderApp("/");

    await user.click(await screen.findByRole("link", { name: "Ada Lovelace" }));
    await user.click(await screen.findByRole("link", { name: "Ada" }));

    expect(await screen.findByRole("img", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/artists/A0001/entries/${entry.id}`);
  });
});
