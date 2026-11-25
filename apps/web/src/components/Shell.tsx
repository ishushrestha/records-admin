import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { TextLink } from "@/components/TextLink";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/api";

export function Shell({ children }: { readonly children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <div className="min-h-svh">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Records</p>
            <TextLink
              href="/"
              onNavigate={() => {
                void navigate("/");
              }}
            >
              Artists
            </TextLink>
          </div>
          <Button
            onClick={() => {
              void logout().finally(async () => {
                queryClient.clear();
                await navigate("/login");
              });
            }}
            type="button"
            variant="outline"
          >
            Log out
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}
