export interface ToolFailurePayload {
  status: "failed";
  tool: string;
  step: string;
  error: {
    message: string;
  };
  summary: string;
}

export function describeToolError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Unknown error";
}

export function buildToolFailurePayload(params: {
  tool: string;
  step: string;
  error: unknown;
}): ToolFailurePayload {
  const message = describeToolError(params.error);
  return {
    status: "failed",
    tool: params.tool,
    step: params.step,
    error: {
      message,
    },
    summary: `Failed during ${params.tool} (${params.step}): ${message}`,
  };
}

