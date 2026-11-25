import { IMAGE_MAX_BYTES, createEntryFieldsSchema, fieldErrorsFromZod, imageMimeTypes } from "@records/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { useNavigate } from "react-router";
import type { CreateEntryViewProps, EntryFieldErrors } from "@/components/CreateEntryView";
import { ApiError, createEntry } from "@/lib/api";

const acceptedTypes: readonly string[] = imageMimeTypes;

function imageError(file: File | null): string | undefined {
  if (file === null) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  if (file.type.length > 0 && !acceptedTypes.includes(file.type)) {
    return "Use a JPEG, PNG, or WebP image.";
  }
  return undefined;
}

export function useCreateEntry(artistId: string | undefined): Omit<CreateEntryViewProps, "artistId" | "onBack"> & {
  readonly onBack: () => void;
} {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<EntryFieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();

  useEffect(() => {
    return () => {
      if (imagePreviewUrl !== null) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const selectImage = (file: File | null) => {
    setImage(file);
    setImagePreviewUrl((current) => {
      if (current !== null) {
        URL.revokeObjectURL(current);
      }
      return file === null ? null : URL.createObjectURL(file);
    });
  };

  const mutation = useMutation({
    mutationFn: (body: FormData) => createEntry(artistId ?? "", body),
    onSuccess: async (entry) => {
      await queryClient.invalidateQueries({ queryKey: ["artist", artistId] });
      await navigate(`/artists/${entry.artistId}/entries/${entry.id}`);
    },
  });

  return {
    firstName,
    lastName,
    address,
    imageName: image?.name ?? null,
    imagePreviewUrl,
    imageInputKey: 0,
    errors,
    formError:
      formError ??
      (mutation.isError && !(mutation.error instanceof ApiError && mutation.error.fields !== undefined)
        ? mutation.error instanceof ApiError
          ? mutation.error.message
          : "Could not create the entry."
        : undefined),
    isSubmitting: mutation.isPending,
    onFirstNameChange: setFirstName,
    onLastNameChange: setLastName,
    onAddressChange: setAddress,
    onImageSelected: selectImage,
    onBack: () => {
      void navigate("/");
    },
    onSubmit: (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = createEntryFieldsSchema.safeParse({ firstName, lastName, address });
      const fieldErrors = parsed.success ? {} : fieldErrorsFromZod(parsed.error);
      const uploadError = imageError(image);
      const nextErrors: EntryFieldErrors = {
        firstName: fieldErrors.firstName,
        lastName: fieldErrors.lastName,
        address: fieldErrors.address,
        image: uploadError,
      };
      setErrors(nextErrors);
      if (!parsed.success || image === null || uploadError !== undefined || artistId === undefined) {
        setFormError(undefined);
        return;
      }
      const body = new FormData(event.currentTarget);
      body.set("firstName", parsed.data.firstName);
      body.set("lastName", parsed.data.lastName);
      body.set("address", parsed.data.address);
      if (body.get("image") === null) {
        body.set("image", image);
      }
      setFormError(undefined);
      mutation.mutate(body, {
        onError: (error) => {
          if (error instanceof ApiError && error.status === 401) {
            void navigate("/login");
            return;
          }
          if (error instanceof ApiError && error.fields !== undefined) {
            setErrors({
              firstName: error.fields.firstName,
              lastName: error.fields.lastName,
              address: error.fields.address,
              image: error.fields.image,
            });
          }
        },
      });
    },
  };
}
