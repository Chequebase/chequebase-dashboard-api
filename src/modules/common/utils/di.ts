import { createId } from "@paralleldrive/cuid2";
import Container from "typedi";
import { createPinoLogger } from "./logger-v2";

export function createDiScopedContainer(id?: string) {
  const container = Container.of(id ?? createId());
  const logger = createPinoLogger();
  container.set("logger", logger);
  container.set("container", container);
  return container;
}
