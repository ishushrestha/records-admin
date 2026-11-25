import { ArtistListView } from "@/components/ArtistListView";
import { EntryRequestListView } from "@/components/EntryRequestListView";
import { Shell } from "@/components/Shell";
import { useArtists } from "@/hooks/useArtists";
import { useEntryRequests } from "@/hooks/useEntryRequests";

export function ArtistsPage() {
  const artists = useArtists();
  const requests = useEntryRequests();
  return (
    <Shell>
      <div className="space-y-12">
        <ArtistListView {...artists} />
        <EntryRequestListView {...requests} />
      </div>
    </Shell>
  );
}
