import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export function apiSuccess<T>(data: T, init?: ResponseInit, meta?: Record<string, unknown>) {
  return NextResponse.json(meta ? { data, meta } : { data }, init);
}

export function apiError(
  status: number,
  code: string,
  message: string,
  options?: { fieldErrors?: Record<string, string[]>; referenceId?: string; headers?: HeadersInit },
) {
  const referenceId = options?.referenceId ?? createReferenceId();
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(options?.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
        referenceId,
      },
    },
    { status, headers: options?.headers },
  );
}

export function apiException(error: unknown) {
  if (error instanceof ZodError) {
    return apiError(422, "VALIDATION_ERROR", "The request contains invalid fields.", {
      fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
    });
  }

  if (error instanceof SyntaxError) {
    return apiError(400, "INVALID_JSON", "The request body must contain valid JSON.");
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return apiError(404, "NOT_FOUND", "The requested record was not found.");
    if (error.code === "P2002") return apiError(409, "CONFLICT", "A record with the same identity already exists.");
  }

  return apiError(500, "INTERNAL_ERROR", "The request could not be completed.");
}

export function createReferenceId() {
  return `TYM-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}
