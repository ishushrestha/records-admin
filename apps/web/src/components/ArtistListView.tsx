import type { Artist } from "@records/contracts";
import { flexRender, type Table } from "@tanstack/react-table";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { isPlainLeftClick } from "@/lib/click";

export interface ArtistListViewProps {
  readonly table: Table<Artist>;
  readonly isLoading: boolean;
  readonly error?: string;
  readonly onOpen: (id: string) => void;
  readonly onCreate: () => void;
}

export function ArtistListView(props: ArtistListViewProps) {
  const rows = props.table.getRowModel().rows;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl tracking-tight">Artists</h1>
          <p className="text-muted-foreground">Each artist has an ID. That ID is the Record ID on the intake form.</p>
        </div>
        <Button onClick={props.onCreate} type="button">
          Create artist
        </Button>
      </div>
      {props.error === undefined ? null : (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <caption className="sr-only">Artists</caption>
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
                  Loading artists…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted-foreground" colSpan={props.table.getAllColumns().length}>
                  No artists yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const artist = row.original;
                const href = `/artists/${artist.id}`;
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
                      props.onOpen(artist.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }
                      if (event.target instanceof Element && event.target.closest("a") !== null) {
                        return;
                      }
                      event.preventDefault();
                      props.onOpen(artist.id);
                    }}
                    tabIndex={0}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td className="px-4 py-3 align-middle" key={cell.id}>
                        {cell.column.id === "name" ? (
                          <a
                            className="font-medium underline-offset-4 hover:underline"
                            href={href}
                            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                              if (!isPlainLeftClick(event)) {
                                return;
                              }
                              event.preventDefault();
                              props.onOpen(artist.id);
                            }}
                          >
                            {artist.name}
                          </a>
                        ) : (
                          <span className="font-mono">{artist.id}</span>
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
    </div>
  );
}
