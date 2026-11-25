import { createServer } from "node:http";
import { NodeHttpServer } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter } from "effect/http";
import type { AppConfig } from "./config.js";
import { makeRoutes } from "./http.js";

export const makeServer = (config: AppConfig) =>
  HttpRouter.serve(makeRoutes(config)).pipe(Layer.provide(NodeHttpServer.layer(() => createServer(), { port: config.port })));

export const makeHandler = (config: AppConfig) => HttpRouter.toWebHandler(makeRoutes(config), { disableLogger: true });
