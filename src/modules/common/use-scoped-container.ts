import { useContainer, ClassConstructor, Action } from "routing-controllers";
import Container from "typedi";

export default function useScopeContainer() {
  useContainer({
    get<T>(someClass: ClassConstructor<T>, action?: Action): T {
      if (!action) {
        return Container.get(someClass);
      }

      const request = action.request;
      if (!request.di) {
        throw new Error(
          "DI container not found in request object. Make sure the diMiddleware is used before this middleware"
        );
      }

      return request.di.get(someClass);
    },
  });
}
