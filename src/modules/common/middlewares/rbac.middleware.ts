import { Action, UnauthorizedError } from 'routing-controllers'
import jwt from "jsonwebtoken";
import { getEnvOrThrow } from '../utils';
import Logger from '../utils/logger';
import User, { KycStatus, UserStatus } from '@/models/user.model';
import { IOrganization } from '@/models/organization.model';
import { AuthUser } from '../interfaces/auth-user';

const logger = new Logger('rbac')

const secretKey = getEnvOrThrow('ACCESS_TOKEN_SECRET');
export const CurrentUser = async (requestAction: Action) => {
  return requestAction.request.auth
}

export const verifyToken = (token: string, secret = secretKey) => {
  try {
    const decodedToken = jwt.verify(token, secret);
    if (!decodedToken) {
      throw new UnauthorizedError("Unauthorized!");
    }

    return decodedToken;
  } catch (error: any) {
    logger.error('error validating token', { error: error.message, component: "jwt" });
    throw new UnauthorizedError("Unauthorized!");
  }
}

export const RBAC = async (requestAction: Action, action: string[] = []) => {
  const token = requestAction.request.headers['authorization']?.split('Bearer ')?.pop()
  requestAction.request.auth = verifyToken(token)
  if (!requestAction.request?.auth) { 
    throw new UnauthorizedError('Unauthorized')
  }

  if (!action.length) {
    return true;
  }

  const { sub: id } = requestAction.request.auth as AuthUser;
  const user = await User.findById(id).populate<{ organization: IOrganization }>('organization')
  if (!user || user.status === UserStatus.DELETED || user.status === UserStatus.DISABLED) {
    throw new UnauthorizedError('Unauthorized')
  }
  if (user?.organization.status === KycStatus.BLOCKED) {
    throw new UnauthorizedError('Can Not Log In At This Time')
  }

  return action.some((role) => action.includes(role)) || (user.id === user.organization.admin);
}
