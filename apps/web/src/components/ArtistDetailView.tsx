import type { Artist, Entry } from "@records/contracts";
import { flexRender, type Table } from "@tanstack/react-table";
import type { MouseEvent } from "react";
import { BackToArtistsButton } from "@/components/BackToArtistsButton";
import { Button } from "@/components/ui/button";
import { isPlainLeftClick } from "@/lib/click";

export interface ArtistDetailViewProps {
  readonly artist?: Artist;
  readonly table: Table<Entry>;
  readonly isLoading: boolean;
  readonly error?: string;
  readonly onBack: () => void;
  readonly onCreateEntry: () => void;
  readonly onOpenEntry: (id: string) => void;
}

export function ArtistDetailView(props: ArtistDetailViewProps) {
  const rows = props.table.getRowModel().rows;
  const artist = props.artist;

  return (
    <div className="space-y-8">
      <BackToArtistsButton onNavigate={props.onBack} />
      {props.isLoading ? (
        <p className="text-muted-foreground" role="status">
          Loading artist…
        </p>
      ) : props.error !== undefined ? (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      ) : artist === undefined ? null : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                ID <span className="font-mono text-base text-foreground" id="artist-id">{artist.id}</span>
              </p>
              <h1 className="text-4xl tracking-tight" id="artist-name">
                {artist.name}
              </h1>
              <p className="max-w-xl text-muted-foreground">
                Use {artist.id} as the Record ID on the intake form. Entries for this artist are listed below.
              </p>
            </div>
            <Button onClick={props.onCreateEntry} type="button">
              Create entry
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <caption className="sr-only">Entries for {artist.name}</caption>
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
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-muted-foreground" colSpan={props.table.getAllColumns().length}>
                      No entries yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const entry = row.original;
                    const href = `/artists/${artist.id}/entries/${entry.id}`;
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
                          props.onOpenEntry(entry.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") {
                            return;
                          }
                          if (event.target instanceof Element && event.target.closest("a") !== null) {
                            return;
                          }
                          event.preventDefault();
                          props.onOpenEntry(entry.id);
                        }}
                        tabIndex={0}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td className="px-4 py-3 align-middle" key={cell.id}>
                            {cell.column.id === "firstName" ? (
                              <a
                                className="font-medium underline-offset-4 hover:underline"
                                href={href}
                                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                                  if (!isPlainLeftClick(event)) {
                                    return;
                                  }
                                  event.preventDefault();
                                  props.onOpenEntry(entry.id);
                                }}
                              >
                                {entry.firstName}
                              </a>
                            ) : cell.column.id === "image" ? (
                              <img
                                alt=""
                                className="h-12 w-12 rounded-md border border-border object-cover"
                                src={`/api/entries/${entry.id}/image`}
                              />
                            ) : cell.column.id === "address" ? (
                              <span className="line-clamp-2 max-w-xs whitespace-pre-wrap">{entry.address}</span>
                            ) : (
                              entry.lastName
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
        </>
      )}
    </div>
  );
}
