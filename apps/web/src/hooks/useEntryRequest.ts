import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { EntryRequestDetailViewProps } from "@/components/EntryRequestDetailView";
import { ApiError, decideEntryRequest, fetchEntryRequest } from "@/lib/api";

export function useEntryRequest(requestId: string | undefined): EntryRequestDetailViewProps {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["entry-request", requestId],
    queryFn: () => fetchEntryRequest(requestId ?? ""),
    enabled: requestId !== undefined && requestId.length > 0,
  });

  useEffect(() => {
    if (detail.error instanceof ApiError && detail.error.status === 401) {
      void navigate("/login");
    }
  }, [detail.error, navigate]);

  const decision = useMutation({
    mutationFn: (action: "verify" | "reject") => decideEntryRequest(requestId ?? "", action),
    onSuccess: async (request) => {
      queryClient.setQueryData(["entry-request", requestId], request);
      await queryClient.invalidateQueries({ queryKey: ["entry-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["artist", request.artistId] });
    },
  });

  return {
    request: detail.data,
    isLoading: detail.isLoading,
    error:
      requestId === undefined || requestId.length === 0
        ? "No entry request exists with that id."
        : detail.isError && !(detail.error instanceof ApiError && detail.error.status === 401)
          ? detail.error instanceof ApiError
            ? detail.error.message
            : "Could not load that entry request."
          : decision.isError
            ? decision.error instanceof ApiError
              ? decision.error.message
              : "Could not update that entry request."
            : undefined,
    isDeciding: decision.isPending,
    onBack: () => {
      void navigate("/");
    },
    onVerify: () => {
      decision.mutate("verify");
    },
    onReject: () => {
      decision.mutate("reject");
    },
    onOpenEntry: (artistId, entryId) => {
      void navigate(`/artists/${artistId}/entries/${entryId}`);
    },
  };
}
