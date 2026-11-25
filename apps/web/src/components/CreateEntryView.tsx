import type { SubmitEvent } from "react";
import { TextLink } from "@/components/TextLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface EntryFieldErrors {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly address?: string;
  readonly image?: string;
}

export interface CreateEntryViewProps {
  readonly artistId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly address: string;
  readonly imageName: string | null;
  readonly imagePreviewUrl: string | null;
  readonly imageInputKey: number;
  readonly errors: EntryFieldErrors;
  readonly formError?: string;
  readonly isSubmitting: boolean;
  readonly onFirstNameChange: (value: string) => void;
  readonly onLastNameChange: (value: string) => void;
  readonly onAddressChange: (value: string) => void;
  readonly onImageSelected: (file: File | null) => void;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  readonly onBack: () => void;
}

function FieldError({ id, message }: { readonly id: string; readonly message: string | undefined }) {
  if (message === undefined) {
    return null;
  }
  return (
    <p className="text-sm text-destructive" id={id} role="alert">
      {message}
    </p>
  );
}

export function CreateEntryView(props: CreateEntryViewProps) {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <TextLink href={`/artists/${props.artistId}`} onNavigate={props.onBack}>
        Back to artist
      </TextLink>
      <div className="space-y-2">
        <p className="font-mono text-sm text-muted-foreground">Artist ID {props.artistId}</p>
        <h1 className="text-4xl tracking-tight" id="create-entry-title">
          Create entry
        </h1>
        <p className="text-muted-foreground">First name, last name, address, and an image.</p>
      </div>
      <form aria-labelledby="create-entry-title" className="space-y-4" noValidate onSubmit={props.onSubmit}>
        {props.formError === undefined ? null : (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" id="form-error" role="alert">
            {props.formError}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            aria-describedby={props.errors.firstName === undefined ? undefined : "firstName-error"}
            aria-invalid={props.errors.firstName === undefined ? undefined : true}
            aria-required="true"
            autoComplete="given-name"
            id="firstName"
            name="firstName"
            onChange={(event) => {
              props.onFirstNameChange(event.target.value);
            }}
            value={props.firstName}
          />
          <FieldError id="firstName-error" message={props.errors.firstName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            aria-describedby={props.errors.lastName === undefined ? undefined : "lastName-error"}
            aria-invalid={props.errors.lastName === undefined ? undefined : true}
            aria-required="true"
            autoComplete="family-name"
            id="lastName"
            name="lastName"
            onChange={(event) => {
              props.onLastNameChange(event.target.value);
            }}
            value={props.lastName}
          />
          <FieldError id="lastName-error" message={props.errors.lastName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Textarea
            aria-describedby={props.errors.address === undefined ? undefined : "address-error"}
            aria-invalid={props.errors.address === undefined ? undefined : true}
            aria-required="true"
            autoComplete="street-address"
            id="address"
            name="address"
            onChange={(event) => {
              props.onAddressChange(event.target.value);
            }}
            value={props.address}
          />
          <FieldError id="address-error" message={props.errors.address} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="image">Image</Label>
          <Input
            accept="image/jpeg,image/png,image/webp"
            aria-describedby={props.errors.image === undefined ? undefined : "image-error"}
            aria-invalid={props.errors.image === undefined ? undefined : true}
            aria-required="true"
            id="image"
            key={props.imageInputKey}
            name="image"
            onChange={(event) => {
              props.onImageSelected(event.target.files?.[0] ?? null);
            }}
            type="file"
          />
          {props.imagePreviewUrl === null ? null : (
            <img alt="Selected image preview" className="h-32 w-full rounded-md border border-border object-contain" src={props.imagePreviewUrl} />
          )}
          {props.imageName === null ? null : <p className="text-sm text-muted-foreground">{props.imageName}</p>}
          <FieldError id="image-error" message={props.errors.image} />
        </div>
        <Button aria-busy={props.isSubmitting} disabled={props.isSubmitting} type="submit">
          Create entry
        </Button>
      </form>
    </div>
  );
}
