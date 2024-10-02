import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import cors from "cors";
import express, { Request, Response } from "express";
import basicAuth from 'express-basic-auth';
import helmet from "helmet";
import hpp from "hpp";
import { RoutingControllersOptions, getMetadataArgsStorage, useContainer, useExpressServer } from "routing-controllers";
import { routingControllersToSpec } from 'routing-controllers-openapi';
import * as swaggerUiExpress from 'swagger-ui-express';
import Container from "typedi";
import ApprovalsController from './modules/approvals/approvals.controller';
import LogController from './modules/audit-logs/logs.controller';
import BanksphereController from './modules/banksphere/banksphere.controller';
import BillingController from "./modules/billing/plan.controller";
import BudgetController from './modules/budget/budget.controller';
import apiRequestLogger from "./modules/common/middlewares/api-request-logger";
import { ExceptionFilter } from "./modules/common/middlewares/exception-filter.middleware";
import { CurrentUser, RBAC } from "./modules/common/middlewares/rbac.middleware";
import OrganizationsController from "./modules/organization/organization.controller";
import { OverviewController } from './modules/overview/overview.controller';
import PeopleController from './modules/people/people.controller';
import ProviderController from './modules/select-providers/providers.controller';
import SettingsController from './modules/settings/settings.controller';
import UserController from "./modules/user/user.controller";
import WalletController from "./modules/wallet/wallet.controller";
import WebhookController from "./modules/webhook/webhook.controller";
import PayrollController from './modules/payroll/payroll.controller';

const { defaultMetadataStorage } = require('class-transformer/cjs/storage')

const app = express();

app.use(hpp());
app.set("trust proxy", true);
app.use(helmet());
app.use(cors());
// !NOTE: do not uncomment!! Make sure to use @JsonController() instead. The body parser middleware breaks the webhook verification logic
// app.use(express.json());
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
    BillingController,
    WebhookController,
    BudgetController,
    OverviewController,
    SettingsController,
    PeopleController,
    ApprovalsController,
    BanksphereController,
    LogController,
    ProviderController,
    PayrollController
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

// override express default 404 page
app.use((_, res, __) => {
  if (!res.headersSent) {
    return res.status(404).json({
      status: 'error',
      message: 'Resource does not exist',
    });
  }
  res.end();
});

export default app;
