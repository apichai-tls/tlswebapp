"use client";

import { useSyncExternalStore } from "react";
import { jobStore, type Job } from "./store";

export function useJobs(): Job[] {
  return useSyncExternalStore(jobStore.subscribe, jobStore.getSnapshot, jobStore.getSnapshot);
}
