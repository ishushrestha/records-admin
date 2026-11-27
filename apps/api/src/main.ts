import { NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { loadConfig } from "./config.js";
import { makeServer } from "./server.js";

function start(): void {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  console.log(`Records admin listening on http://${config.host}:${config.port}`);
  NodeRuntime.runMain()(Layer.launch(makeServer(config)));
}

start();
