import type { SubmitEvent } from "react";
import { BackToArtistsButton } from "@/components/BackToArtistsButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CreateArtistViewProps {
  readonly name: string;
  readonly nameError?: string;
  readonly formError?: string;
  readonly isSubmitting: boolean;
  readonly onNameChange: (value: string) => void;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  readonly onBack: () => void;
}

export function CreateArtistView(props: CreateArtistViewProps) {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <BackToArtistsButton onNavigate={props.onBack} />
      <div className="space-y-2">
        <h1 className="text-4xl tracking-tight" id="create-artist-title">
          Create artist
        </h1>
        <p className="text-muted-foreground">The ID is assigned when you save. You only enter a name.</p>
      </div>
      <form aria-labelledby="create-artist-title" className="space-y-4" noValidate onSubmit={props.onSubmit}>
        {props.formError === undefined ? null : (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {props.formError}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            aria-describedby={props.nameError === undefined ? undefined : "name-error"}
            aria-invalid={props.nameError === undefined ? undefined : true}
            aria-required="true"
            autoComplete="off"
            id="name"
            name="name"
            onChange={(event) => {
              props.onNameChange(event.target.value);
            }}
            value={props.name}
          />
          {props.nameError === undefined ? null : (
            <p className="text-sm text-destructive" id="name-error" role="alert">
              {props.nameError}
            </p>
          )}
        </div>
        <Button aria-busy={props.isSubmitting} disabled={props.isSubmitting} type="submit">
          Create artist
        </Button>
      </form>
    </div>
  );
}
