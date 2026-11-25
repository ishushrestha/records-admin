import type { EntryRequestListItem } from "@records/contracts";
import { flexRender, type Table } from "@tanstack/react-table";
import type { MouseEvent } from "react";
import { isPlainLeftClick } from "@/lib/click";

export interface EntryRequestListViewProps {
  readonly table: Table<EntryRequestListItem>;
  readonly count: number;
  readonly isLoading: boolean;
  readonly error?: string;
  readonly onOpen: (id: string) => void;
}

function receivedLabel(value: string): string {
  return value.slice(0, 16).replace("T", " ");
}

export function EntryRequestListView(props: EntryRequestListViewProps) {
  const rows = props.table.getRowModel().rows;

  return (
    <section className="space-y-4" aria-labelledby="entry-requests-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-3xl tracking-tight" id="entry-requests-title">
          Entry requests from LLM
        </h2>
        <span
          className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-sm font-medium text-primary-foreground"
          aria-label={`${props.count} pending`}
        >
          {props.count}
        </span>
      </div>
      <p className="text-muted-foreground">Pending requests stay here until you verify or reject them.</p>
      {props.error === undefined ? null : (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">Entry requests from LLM</caption>
          <thead className="bg-muted/70 text-left">
            {props.table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th className="px-4 py-3 font-medium" key={header.id} scope="col">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {props.isLoading ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={props.table.getAllColumns().length}>
                  Loading entry requests…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={props.table.getAllColumns().length}>
                  No entry requests from the LLM.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const request = row.original;
                const href = `/entry-requests/${request.id}`;
                const person = `${request.firstName} ${request.lastName}`;
                return (
                  <tr
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                    key={row.id}
                    onClick={(event) => {
                      if (!isPlainLeftClick(event)) {
                        return;
                      }
                      if (event.target instanceof Element && event.target.closest("a") !== null) {
                        return;
                      }
                      props.onOpen(request.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }
                      if (event.target instanceof Element && event.target.closest("a") !== null) {
                        return;
                      }
                      event.preventDefault();
                      props.onOpen(request.id);
                    }}
                    tabIndex={0}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td className="px-4 py-3 align-middle" key={cell.id}>
                        {cell.column.id === "person" ? (
                          <a
                            className="font-medium underline-offset-4 hover:underline"
                            href={href}
                            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                              if (!isPlainLeftClick(event)) {
                                return;
                              }
                              event.preventDefault();
                              props.onOpen(request.id);
                            }}
                          >
                            {person}
                          </a>
                        ) : cell.column.id === "artistId" ? (
                          <span className="font-mono">{request.artistId}</span>
                        ) : cell.column.id === "artistName" ? (
                          request.artistName
                        ) : (
                          <time dateTime={request.createdAt}>{receivedLabel(request.createdAt)}</time>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
