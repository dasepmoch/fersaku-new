import { publicEnv } from "@/shared/config/env";

/** Frontend is mock-first until the Go platform API is connected. */
export function isLiveApi() {
  return publicEnv.dataSource === "api";
}
