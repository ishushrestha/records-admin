import { useParams } from "react-router";
import { CreateEntryView } from "@/components/CreateEntryView";
import { Shell } from "@/components/Shell";
import { useCreateEntry } from "@/hooks/useCreateEntry";

export function CreateEntryPage() {
  const { artistId } = useParams();
  const props = useCreateEntry(artistId);
  return (
    <Shell>
      <CreateEntryView artistId={artistId ?? ""} {...props} />
    </Shell>
  );
}
