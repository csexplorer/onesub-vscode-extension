import { AIProvider } from "../providers/AIProvider.js";
import { HealthManager } from "../ui/health.js";

/** Shared dependencies handed to each feature command. */
export interface FeatureDeps {
  provider: AIProvider;
  health: HealthManager;
}
