import type { Artist } from "@records/contracts";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import type { ArtistListViewProps } from "@/components/ArtistListView";
import { ApiError, fetchArtists } from "@/lib/api";

const columns = createColumnHelper<Artist>();

const artistColumns = [
  columns.accessor("id", { header: "ID" }),
  columns.accessor("name", { header: "Name" }),
];

const noArtists: Artist[] = [];

export function useArtists(): ArtistListViewProps {
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ["artists"],
    queryFn: fetchArtists,
  });

  useEffect(() => {
    if (list.error instanceof ApiError && list.error.status === 401) {
      void navigate("/login");
    }
  }, [list.error, navigate]);

  // Keep this array referentially stable. A fresh array on every render makes
  // TanStack Table reset its page index, and that setState renders again forever.
  const rows = useMemo(() => (list.data === undefined ? noArtists : [...list.data]), [list.data]);

  // TanStack Table owns the row model. Body cells are rendered by the view so
  // the name stays a plain anchor; a router Link inside flexRender swallows the click.
  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable is the library's API
  const table = useReactTable({
    data: rows,
    columns: artistColumns,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
  });

  return {
    table,
    isLoading: list.isLoading,
    error: list.isError && !(list.error instanceof ApiError && list.error.status === 401) ? "Could not load artists." : undefined,
    onOpen: (id) => {
      void navigate(`/artists/${id}`);
    },
    onCreate: () => {
      void navigate("/artists/new");
    },
  };
}
