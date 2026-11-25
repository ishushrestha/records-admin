import { Button } from "@/components/ui/button";

export function BackToArtistButton({ onNavigate }: { readonly onNavigate: () => void }) {
  return (
    <Button onClick={onNavigate} type="button" variant="outline">
      Back to artist
    </Button>
  );
}
