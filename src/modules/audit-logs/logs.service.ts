import Logs from "@/models/logs.model";
import mongoose, { PipelineStage } from "mongoose";
import { NotFoundError } from "routing-controllers";
import { Service } from "typedi";
import { GetAuditTrailLogs } from "./dto/logs.dto";

@Service()
export default class LogService {
  async getAuditTrailLogs(organization: string, data: GetAuditTrailLogs) {
    const match: PipelineStage.Match = {
      $match: {
        organization: new mongoose.Types.ObjectId(organization)
      }
    }

    if (data.user) {
      match.$match.user = new mongoose.Types.ObjectId(data.user)
    }

    if (data.action) {
      match.$match.action = data.action
    }

    if (data.statusCode) {
      match.$match.statusCode = data.statusCode
    }

    if (data.from && data.to) {
      match.$match.createdAt = {
        $gte: new Date(data.from),
        $lte: new Date(data.to)
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
          ip: 1,
          action: 1,
          method: 1,
          details: 1,
          url: 1,
          statusCode: 1,
          createdAt: 1,
          updatedAt: 1,
          userDetails: 1,
          organizationDetails: 1
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]

    const options = {
      page: data.page || 1,
      limit: 10
    }

    return (await Logs.aggregatePaginate(Logs.aggregate(pipeline), options)).docs;
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