import type { Entry } from "@records/contracts";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { ArtistDetailViewProps } from "@/components/ArtistDetailView";
import { ApiError, fetchArtist } from "@/lib/api";

const columns = createColumnHelper<Entry>();

const entryColumns = [
  columns.accessor("firstName", { header: "First name" }),
  columns.accessor("lastName", { header: "Last name" }),
  columns.accessor("address", { header: "Address" }),
  columns.display({ id: "image", header: "Image" }),
];

export function useArtist(artistId: string | undefined): ArtistDetailViewProps {
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["artist", artistId],
    queryFn: () => fetchArtist(artistId ?? ""),
    enabled: artistId !== undefined && artistId.length > 0,
  });

  useEffect(() => {
    if (detail.error instanceof ApiError && detail.error.status === 401) {
      void navigate("/login");
    }
  }, [detail.error, navigate]);

  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable is the library's API
  const table = useReactTable({
    data: detail.data === undefined ? [] : [...detail.data.entries],
    columns: entryColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const error =
    artistId === undefined || artistId.length === 0
      ? "No artist exists with that id."
      : detail.isError && !(detail.error instanceof ApiError && detail.error.status === 401)
        ? detail.error instanceof ApiError
          ? detail.error.message
          : "Could not load that artist."
        : undefined;

  return {
    artist: detail.data?.artist,
    table,
    isLoading: detail.isLoading,
    error,
    onBack: () => {
      void navigate("/");
    },
    onCreateEntry: () => {
      if (artistId !== undefined) {
        void navigate(`/artists/${artistId}/entries/new`);
      }
    },
    onOpenEntry: (id) => {
      if (artistId !== undefined) {
        void navigate(`/artists/${artistId}/entries/${id}`);
      }
    },
  };
}
