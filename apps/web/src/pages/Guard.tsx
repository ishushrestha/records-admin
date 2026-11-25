import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { fetchSession } from "@/lib/api";

export function Guard({ children }: { readonly children: ReactNode }) {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
  });

  if (session.isLoading) {
    return (
      <p className="px-6 py-16 text-muted-foreground" role="status">
        Checking session…
      </p>
    );
  }
  if (session.data !== true) {
    return <Navigate replace to="/login" />;
  }
  return children;
}
