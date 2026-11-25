import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { EntryDetailViewProps } from "@/components/EntryDetailView";
import { ApiError, fetchEntry } from "@/lib/api";

export function useEntry(entryId: string | undefined, artistId: string | undefined): EntryDetailViewProps {
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["entry", entryId],
    queryFn: () => fetchEntry(entryId ?? ""),
    enabled: entryId !== undefined && entryId.length > 0,
  });

  useEffect(() => {
    if (detail.error instanceof ApiError && detail.error.status === 401) {
      void navigate("/login");
    }
  }, [detail.error, navigate]);

  return {
    entry: detail.data,
    isLoading: detail.isLoading,
    error:
      entryId === undefined || entryId.length === 0
        ? "No entry exists with that id."
        : detail.isError && !(detail.error instanceof ApiError && detail.error.status === 401)
          ? detail.error instanceof ApiError
            ? detail.error.message
            : "Could not load that entry."
          : undefined,
    onBack: () => {
      const target = artistId ?? detail.data?.artistId;
      void navigate(target === undefined ? "/" : `/artists/${target}`);
    },
  };
}
