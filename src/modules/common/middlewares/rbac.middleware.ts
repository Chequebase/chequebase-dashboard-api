import { Action, UnauthorizedError } from 'routing-controllers'
import jwt from "jsonwebtoken";
import { getEnvOrThrow } from '../utils';
import Logger from '../utils/logger';
import User, { KycStatus, UserStatus } from '@/models/user.model';
import { IOrganization } from '@/models/organization.model';

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

export const RBAC = async (requestAction: Action, actions: string[] = []) => {
  const token = requestAction.request.headers['authorization']?.split('Bearer ')?.pop()
  const decodedToken = verifyToken(token)
  if (!decodedToken) {
    throw new UnauthorizedError('Unauthorized')
  }

  const user = await User.findById(decodedToken.sub)
    .populate<{ organization: IOrganization }>('organization')
    .populate({
      path: 'roleRef', select: 'name type permissions',
      populate: { path: 'permissions', select: 'actions name' }
    })

  if (!user || user.status === UserStatus.DELETED || user.status === UserStatus.DISABLED) {
    throw new UnauthorizedError('Unauthorized')
  }

  if (user?.organization.status === KycStatus.BLOCKED) {
    throw new UnauthorizedError('Can Not Log In At This Time')
  }

  requestAction.request.auth = Object.assign(decodedToken, { roleRef: user?.roleRef })
 
  if (!actions.length) {
    return true;
  }

  if (!user.roleRef) {
    return actions.includes(user.role)
  }
 
  let userActions = user.roleRef?.permissions?.flatMap((p: any) => p.actions)

  return actions.some((role) => userActions.includes(role)) ||
    (user.id === user.organization.admin) ||
    user.roleRef.name === 'owner';
}
