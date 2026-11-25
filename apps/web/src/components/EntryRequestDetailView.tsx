import type { EntryRequest } from "@records/contracts";
import { BackToArtistsButton } from "@/components/BackToArtistsButton";
import { Button } from "@/components/ui/button";

export interface EntryRequestDetailViewProps {
  readonly request?: EntryRequest;
  readonly isLoading: boolean;
  readonly error?: string;
  readonly isDeciding: boolean;
  readonly onBack: () => void;
  readonly onVerify: () => void;
  readonly onReject: () => void;
  readonly onOpenEntry: (artistId: string, entryId: string) => void;
}

const statusLabels = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

export function EntryRequestDetailView(props: EntryRequestDetailViewProps) {
  const request = props.request;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackToArtistsButton onNavigate={props.onBack} />
      {props.isLoading ? (
        <p className="text-muted-foreground" role="status">
          Loading entry request…
        </p>
      ) : props.error !== undefined ? (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      ) : request === undefined ? null : (
        <>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{statusLabels[request.status]}</p>
            <h1 className="text-4xl tracking-tight">
              {request.firstName} {request.lastName}
            </h1>
          </div>
          <img
            alt={`${request.firstName} ${request.lastName}`}
            className="max-h-96 w-full rounded-xl border border-border bg-card object-contain"
            src={`/api/entry-requests/${request.id}/image`}
          />
          <dl className="grid gap-4 rounded-xl border border-border bg-card p-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Target artist</dt>
              <dd>
                <span className="font-mono">{request.artistId}</span> {request.artistName}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">First name</dt>
              <dd>{request.firstName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last name</dt>
              <dd>{request.lastName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Address</dt>
              <dd className="whitespace-pre-wrap">{request.address}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">LLM notes</dt>
              <dd className="whitespace-pre-wrap">{request.llmNotes ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source submission</dt>
              <dd className="font-mono">{request.sourceSubmissionId}</dd>
            </div>
          </dl>
          {request.status === "pending" ? (
            <div className="flex flex-wrap gap-3">
              <Button disabled={props.isDeciding} onClick={props.onVerify} type="button">
                Verified
              </Button>
              <Button disabled={props.isDeciding} onClick={props.onReject} type="button" variant="outline">
                Reject
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p>This request is {request.status}.</p>
              {request.createdEntryId === null ? null : (
                <Button
                  onClick={() => {
                    props.onOpenEntry(request.artistId, request.createdEntryId ?? "");
                  }}
                  type="button"
                  variant="outline"
                >
                  View entry
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
