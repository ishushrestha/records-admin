import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useNavigate } from "react-router";
import type { LoginViewProps } from "@/components/LoginView";
import { ApiError, login } from "@/lib/api";

export function useLogin(): LoginViewProps {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: (credentials: { readonly username: string; readonly password: string }) =>
      login(credentials.username, credentials.password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await navigate("/");
    },
  });

  const error = mutation.isError ? (mutation.error instanceof ApiError ? mutation.error.message : "Could not log in.") : undefined;

  return {
    username,
    password,
    error,
    isSubmitting: mutation.isPending,
    onUsernameChange: setUsername,
    onPasswordChange: setPassword,
    onSubmit: (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      mutation.mutate({ username, password });
    },
  };
}
