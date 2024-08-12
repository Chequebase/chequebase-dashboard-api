import Logs from "@/models/logs.model";
import mongoose, { PipelineStage } from "mongoose";
import { NotFoundError } from "routing-controllers";
import { Service } from "typedi";
import { GetAuditTrailLogs } from "./dto/logs.dto";

@Service()
export default class LogService {
  async getAuditTrailLogs(organization: string, query: GetAuditTrailLogs) {
    const match: PipelineStage.Match = {
      $match: {
        organization: new mongoose.Types.ObjectId(organization)
      }
    }

    if (query.user) {
      match.$match.user = new mongoose.Types.ObjectId(query.user)
    }

    if (query.action) {
      match.$match.action = query.action
    }

    if (query.statusCode) {
      match.$match.statusCode = query.statusCode
    }

    if (query.from && query.to) {
      match.$match.createdAt = {
        $gte: new Date(query.from),
        $lte: new Date(query.to)
      }
    }

    const pipeline: PipelineStage[] = [
      match,
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userDetails',
          pipeline: [
            { $project: { _id: 1, firstName: 1, lastName: 1, email: 1 } }
          ]
        }
      },
      {
        $unwind: {
          path: '$userDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'organizations',
          localField: 'organization',
          foreignField: '_id',
          as: 'organizationDetails',
          pipeline: [
            { $project: { _id: 1, businessName: 1 } }
          ]
        }
      },
      {
        $unwind: {
          path: '$organizationDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          organization: 1,
          user: 1,
          action: 1,
          url: 1,
          createdAt: 1,
          userDetails: 1,
          organizationDetails: 1
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]

    const result = await Logs.aggregatePaginate(Logs.aggregate(pipeline), {
      page: Number(query.page),
      limit: query.limit,
      lean: true,
    })

    return result;
  }

  async getSingleAuditTrailLog(logId: string, organization: string) {
    const log = await Logs.findOne({ _id: logId, organization })
      .populate('user', 'firstName lastName email')
      .populate('organization', 'businessName')

    if (!log) {
      throw new NotFoundError('Cannot fetch log');
    }

    return log;
  }
}