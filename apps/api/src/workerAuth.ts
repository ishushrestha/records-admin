import { createHash, timingSafeEqual } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import { AppConfigService } from "./services.js";

export type WorkerAccess = "ok" | "unconfigured" | "unauthorized";

export class WorkerAuth extends Context.Service<
  WorkerAuth,
  {
    readonly authorize: (authorization: string | undefined) => WorkerAccess;
  }
>()("records/WorkerAuth") {}

export function bearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
  return match?.[1];
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export const WorkerAuthLive = Layer.effect(
  WorkerAuth,
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const expected = config.workerToken === undefined ? undefined : digest(config.workerToken);
    return {
      authorize: (authorization) => {
        if (expected === undefined) {
          return "unconfigured";
        }
        const token = bearerToken(authorization);
        const actual = digest(token ?? "");
        const matches = timingSafeEqual(actual, expected);
        if (token === undefined || !matches) {
          return "unauthorized";
        }
        return "ok";
      },
    };
  }),
);
