import { artistNameSchema } from "@records/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useNavigate } from "react-router";
import type { CreateArtistViewProps } from "@/components/CreateArtistView";
import { ApiError, createArtist } from "@/lib/api";

export function useCreateArtist(): CreateArtistViewProps {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const mutation = useMutation({
    mutationFn: createArtist,
    onSuccess: async (artist) => {
      await queryClient.invalidateQueries({ queryKey: ["artists"] });
      await navigate(`/artists/${artist.id}`);
    },
  });

  return {
    name,
    nameError,
    formError:
      formError ??
      (mutation.isError && !(mutation.error instanceof ApiError && mutation.error.fields?.name !== undefined)
        ? mutation.error instanceof ApiError
          ? mutation.error.message
          : "Could not create the artist."
        : undefined),
    isSubmitting: mutation.isPending,
    onNameChange: (value) => {
      setName(value);
      setNameError(undefined);
    },
    onBack: () => {
      void navigate("/");
    },
    onSubmit: (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = artistNameSchema.safeParse(name);
      if (!parsed.success) {
        setNameError(parsed.error.issues[0]?.message ?? "Enter a name.");
        setFormError(undefined);
        return;
      }
      setNameError(undefined);
      setFormError(undefined);
      mutation.mutate(parsed.data, {
        onError: (error) => {
          if (error instanceof ApiError && error.status === 401) {
            void navigate("/login");
            return;
          }
          const field = error instanceof ApiError ? error.fields?.name : undefined;
          if (field !== undefined) {
            setNameError(field);
          }
        },
      });
    },
  };
}
