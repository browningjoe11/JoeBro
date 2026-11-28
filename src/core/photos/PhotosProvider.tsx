import { createContext, useContext, type ReactNode } from "react";
import type { PhotosBackend } from "./types";

const PhotosContext = createContext<PhotosBackend | null>(null);

/** Gives screens the photo store: My Day and the ticket screen now, the completion report (M4) later. */
export function PhotosProvider({ backend, children }: { backend: PhotosBackend; children: ReactNode }) {
  return <PhotosContext.Provider value={backend}>{children}</PhotosContext.Provider>;
}

export function usePhotos(): PhotosBackend {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotos must be used inside <PhotosProvider>");
  return ctx;
}
