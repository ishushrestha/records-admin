import { Context } from "effect";
import type { AppConfig } from "./config.js";

export class AppConfigService extends Context.Service<AppConfigService, AppConfig>()("records/AppConfig") {}
