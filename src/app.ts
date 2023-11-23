import { validationMetadatasToSchemas } from 'class-validator-jsonschema'
import basicAuth from 'express-basic-auth'
import express, { Request, Response } from "express";
import { RoutingControllersOptions, getMetadataArgsStorage, useContainer, useExpressServer } from "routing-controllers";
import helmet from "helmet";
import { routingControllersToSpec } from 'routing-controllers-openapi'
import * as swaggerUiExpress from 'swagger-ui-express'
import hpp from "hpp";
import cors from "cors";
import Container from "typedi";
import apiRequestLogger from "./modules/common/middlewares/api-request-logger";
import { ExceptionFilter } from "./modules/common/middlewares/exception-filter.middleware";
import { CurrentUser, RBAC } from "./modules/common/middlewares/rbac.middleware";
import UserController  from "./modules/user/user.controller";
import OrganizationsController from "./modules/organization/organization.controller";
import WalletController from "./modules/wallet/wallet.controller";
import WebhookController from "./modules/webhook/webhook.controller";
import PlansController from "./modules/plan/plan.controller";

const { defaultMetadataStorage } = require('class-transformer/cjs/storage')

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

const rcOptions: RoutingControllersOptions = {
  routePrefix: "/v1",
  controllers: [
    UserController,
    OrganizationsController,
    WalletController,
    PlansController,
    WebhookController
  ],
  middlewares: [ExceptionFilter],
  interceptors: [],
  defaultErrorHandler: false,
  currentUserChecker: CurrentUser,
  authorizationChecker: RBAC,
}

useExpressServer(app, rcOptions);

const schemas: any = validationMetadatasToSchemas({
  classTransformerMetadataStorage: defaultMetadataStorage,
  refPointerPrefix: '#/components/schemas/',
})

const storage = getMetadataArgsStorage()
const spec = routingControllersToSpec(storage, rcOptions, {
  components: { schemas },
})

app.use('/docs',
  basicAuth({
    challenge: true,
    users: { chequebase: 'chequebase' }
  }),
  swaggerUiExpress.serve,
  swaggerUiExpress.setup(spec)
)

export default app;
