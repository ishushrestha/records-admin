import { Navigate, Route, Routes } from "react-router";
import { ArtistPage } from "@/pages/ArtistPage";
import { ArtistsPage } from "@/pages/ArtistsPage";
import { CreateArtistPage } from "@/pages/CreateArtistPage";
import { CreateEntryPage } from "@/pages/CreateEntryPage";
import { EntryPage } from "@/pages/EntryPage";
import { Guard } from "@/pages/Guard";
import { LoginPage } from "@/pages/LoginPage";

export function App() {
  return (
    <Routes>
      <Route element={<LoginPage />} path="/login" />
      <Route
        element={
          <Guard>
            <ArtistsPage />
          </Guard>
        }
        path="/"
      />
      <Route
        element={
          <Guard>
            <CreateArtistPage />
          </Guard>
        }
        path="/artists/new"
      />
      <Route
        element={
          <Guard>
            <ArtistPage />
          </Guard>
        }
        path="/artists/:artistId"
      />
      <Route
        element={
          <Guard>
            <CreateEntryPage />
          </Guard>
        }
        path="/artists/:artistId/entries/new"
      />
      <Route
        element={
          <Guard>
            <EntryPage />
          </Guard>
        }
        path="/artists/:artistId/entries/:entryId"
      />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
