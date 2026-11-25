import type { EntryRequestListItem } from "@records/contracts";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import type { EntryRequestListViewProps } from "@/components/EntryRequestListView";
import { ApiError, fetchEntryRequests } from "@/lib/api";

const columns = createColumnHelper<EntryRequestListItem>();

const requestColumns = [
  columns.accessor("artistId", { header: "Artist ID" }),
  columns.accessor("artistName", { header: "Artist" }),
  columns.accessor((row) => `${row.firstName} ${row.lastName}`, { id: "person", header: "Name" }),
  columns.accessor("createdAt", { header: "Received" }),
];

const noRequests: EntryRequestListItem[] = [];

export function useEntryRequests(): EntryRequestListViewProps {
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ["entry-requests"],
    queryFn: fetchEntryRequests,
  });

  useEffect(() => {
    if (list.error instanceof ApiError && list.error.status === 401) {
      void navigate("/login");
    }
  }, [list.error, navigate]);

  const rows = useMemo(() => (list.data === undefined ? noRequests : [...list.data]), [list.data]);

  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable is the library's API
  const table = useReactTable({
    data: rows,
    columns: requestColumns,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
  });

  return {
    table,
    count: rows.length,
    isLoading: list.isLoading,
    error:
      list.isError && !(list.error instanceof ApiError && list.error.status === 401)
        ? "Could not load entry requests."
        : undefined,
    onOpen: (id) => {
      void navigate(`/entry-requests/${id}`);
    },
  };
}
