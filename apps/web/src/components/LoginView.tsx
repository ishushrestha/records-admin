import type { SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LoginViewProps {
  readonly username: string;
  readonly password: string;
  readonly error?: string;
  readonly isSubmitting: boolean;
  readonly onUsernameChange: (value: string) => void;
  readonly onPasswordChange: (value: string) => void;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

export function LoginView(props: LoginViewProps) {
  return (
    <div className="min-h-svh">
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Records</p>
        <h1 className="mt-3 text-4xl tracking-tight" id="login-title">
          Log in
        </h1>
        <p className="mt-3 text-muted-foreground">Sign in with the admin username and password.</p>
        <form aria-labelledby="login-title" className="mt-8 space-y-4" noValidate onSubmit={props.onSubmit}>
          {props.error === undefined ? null : (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {props.error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              autoComplete="username"
              autoFocus
              id="username"
              name="username"
              onChange={(event) => {
                props.onUsernameChange(event.target.value);
              }}
              value={props.username}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              autoComplete="current-password"
              id="password"
              name="password"
              onChange={(event) => {
                props.onPasswordChange(event.target.value);
              }}
              type="password"
              value={props.password}
            />
          </div>
          <Button aria-busy={props.isSubmitting} className="w-full" disabled={props.isSubmitting} type="submit">
            Log in
          </Button>
        </form>
      </div>
    </div>
  );
}
