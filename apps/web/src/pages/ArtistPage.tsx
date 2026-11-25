import { useParams } from "react-router";
import { ArtistDetailView } from "@/components/ArtistDetailView";
import { Shell } from "@/components/Shell";
import { useArtist } from "@/hooks/useArtist";

export function ArtistPage() {
  const { artistId } = useParams();
  const props = useArtist(artistId);
  return (
    <Shell>
      <ArtistDetailView {...props} />
    </Shell>
  );
}
