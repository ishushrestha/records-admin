import type { MouseEvent, ReactNode } from "react";
import { isPlainLeftClick } from "@/lib/click";

export function TextLink({
  href,
  onNavigate,
  children,
  className,
}: {
  readonly href: string;
  readonly onNavigate: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <a
      className={className ?? "text-sm text-muted-foreground underline-offset-4 hover:underline"}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (!isPlainLeftClick(event)) {
          return;
        }
        event.preventDefault();
        onNavigate();
      }}
    >
      {children}
    </a>
  );
}
