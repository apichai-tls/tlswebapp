import { useSyncExternalStore } from "react";
import { riderStore, type Rider } from "./store";

export function useRiders(): Rider[] {
  return useSyncExternalStore(
    riderStore.subscribe,
    riderStore.getSnapshot,
    riderStore.getSnapshot // Optional standard SSG fallback
  );
}
