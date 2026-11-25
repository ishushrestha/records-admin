import { CreateArtistView } from "@/components/CreateArtistView";
import { Shell } from "@/components/Shell";
import { useCreateArtist } from "@/hooks/useCreateArtist";

export function CreateArtistPage() {
  const props = useCreateArtist();
  return (
    <Shell>
      <CreateArtistView {...props} />
    </Shell>
  );
}
