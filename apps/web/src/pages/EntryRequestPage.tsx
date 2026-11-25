import { useParams } from "react-router";
import { EntryRequestDetailView } from "@/components/EntryRequestDetailView";
import { Shell } from "@/components/Shell";
import { useEntryRequest } from "@/hooks/useEntryRequest";

export function EntryRequestPage() {
  const { requestId } = useParams();
  const props = useEntryRequest(requestId);
  return (
    <Shell>
      <EntryRequestDetailView {...props} />
    </Shell>
  );
}
