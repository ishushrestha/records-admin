import { Button } from "@/components/ui/button";

export function BackToArtistsButton({ onNavigate }: { readonly onNavigate: () => void }) {
  return (
    <Button onClick={onNavigate} type="button" variant="outline">
      Back to artists
    </Button>
  );
}
