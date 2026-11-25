import { NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { loadConfig } from "./config.js";
import { makeServer } from "./server.js";

const config = loadConfig();
console.log(`Records API listening on http://127.0.0.1:${config.port}`);
NodeRuntime.runMain()(Layer.launch(makeServer(config)));
