/** Frontend is mock-first until the Go platform API is connected. */
export function isLiveApi() {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "api";
}
