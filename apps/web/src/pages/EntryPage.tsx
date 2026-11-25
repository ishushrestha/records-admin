import { useParams } from "react-router";
import { EntryDetailView } from "@/components/EntryDetailView";
import { Shell } from "@/components/Shell";
import { useEntry } from "@/hooks/useEntry";

export function EntryPage() {
  const { artistId, entryId } = useParams();
  const props = useEntry(entryId, artistId);
  return (
    <Shell>
      <EntryDetailView {...props} />
    </Shell>
  );
}
