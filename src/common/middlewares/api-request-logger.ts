import { NextFunction } from 'express';
import * as logfmt from 'logfmt';
import Logger from '../utils/logger';

const logger = new Logger('cll');

function apiRequestLogger(request: any, response: any, next: any) {
  return (function (req: any, res: any, next: NextFunction) {
    var end = res.end;
    var startTime = new Date().getTime();
    res.end = function (chunk: any, encoding: any) {
      var data = logfmt.requestLogger.commonFormatter(req, res);

      res.end = end;
      res.end(chunk, encoding);

      let logData: any = {
        http_method: req.method,
        http_status: res.statusCode,
        http_path: req.originalUrl,
        user_agent: req.get('User-Agent'),
        ip: data.ip,
      };

      if (req.auth) {
        logData = { ...logData, user: req.auth?.userId, organization: req.auth?.orgId };
      }

      // calculate request time in seconds
      const elapsed = new Date().getTime() - startTime;
      logData.duration = elapsed / 1000;

      logger.log('canonical-log-line', logData);
    };

    next();
  })(request, response, next);
}

export default apiRequestLogger;