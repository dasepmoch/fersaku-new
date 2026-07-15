import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/http-client";

describe("ApiError", () => {
  it("exposes structured problem details", () => {
    const error = new ApiError(422, {
      code: "VALIDATION_ERROR",
      message: "Invalid payload",
      requestId: "req_123",
    });
    expect(error.status).toBe(422);
    expect(error.problem.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Invalid payload");
    expect(error.name).toBe("ApiError");
  });
});
