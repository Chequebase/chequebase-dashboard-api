import express, { Request, Response } from "express";
import { useContainer, useExpressServer } from "routing-controllers";
import helmet from "helmet";
import hpp from "hpp";
import cors from "cors";
import Container from "typedi";
import apiRequestLogger from "./common/middlewares/api-request-logger";
import { ExceptionFilter } from "./common/middlewares/exception-filter.middleware";
import { CurrentUser, RBAC } from "./common/middlewares/rbac.middleware";
import { UserController } from "./modules/user/user.controller";
import { OrganizationsController } from "./modules/organization/organization.controller";

const app = express();
app.use(hpp());
app.set("trust proxy", true);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(apiRequestLogger)
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_: Request, res: Response) => {
  res.send("<h1>Healthcheck OK! 👍</h1>");
});

useContainer(Container);

useExpressServer(app, {
  routePrefix: "/v1",
  controllers: [UserController, OrganizationsController],
  middlewares: [ExceptionFilter],
  interceptors: [],
  defaultErrorHandler: false,
  currentUserChecker: CurrentUser,
  authorizationChecker: RBAC,
});

export default app;
