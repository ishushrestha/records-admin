import { ArtistListView } from "@/components/ArtistListView";
import { Shell } from "@/components/Shell";
import { useArtists } from "@/hooks/useArtists";

export function ArtistsPage() {
  const props = useArtists();
  return (
    <Shell>
      <ArtistListView {...props} />
    </Shell>
  );
}
