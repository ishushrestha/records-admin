import type { Entry } from "@records/contracts";
import { BackToArtistButton } from "@/components/BackToArtistButton";

export interface EntryDetailViewProps {
  readonly entry?: Entry;
  readonly isLoading: boolean;
  readonly error?: string;
  readonly onBack: () => void;
}

export function EntryDetailView(props: EntryDetailViewProps) {
  const entry = props.entry;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackToArtistButton onNavigate={props.onBack} />
      {props.isLoading ? (
        <p className="text-muted-foreground" role="status">
          Loading entry…
        </p>
      ) : props.error !== undefined ? (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      ) : entry === undefined ? null : (
        <>
          <div className="space-y-2">
            <p className="font-mono text-sm text-muted-foreground">Artist ID {entry.artistId}</p>
            <h1 className="text-4xl tracking-tight">
              {entry.firstName} {entry.lastName}
            </h1>
          </div>
          <img
            alt={`${entry.firstName} ${entry.lastName}`}
            className="max-h-96 w-full rounded-xl border border-border bg-card object-contain"
            src={`/api/entries/${entry.id}/image`}
          />
          <dl className="grid gap-4 rounded-xl border border-border bg-card p-4 text-sm">
            <div>
              <dt className="text-muted-foreground">First name</dt>
              <dd>{entry.firstName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last name</dt>
              <dd>{entry.lastName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Address</dt>
              <dd className="whitespace-pre-wrap">{entry.address}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
