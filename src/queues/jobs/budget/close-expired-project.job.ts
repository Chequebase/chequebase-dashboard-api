import { Job } from "bull";
import dayjs from "dayjs";
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import Logger from "@/modules/common/utils/logger";
import Project, { ProjectStatus } from "@/models/project.model";
import { ProjectService } from "@/modules/budget/project.service";

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isSameOrAfter)
dayjs.tz.setDefault('Africa/Lagos')

async function closeExpiredProject(job: Job) {
  const logger = new Logger('close-expired-project')

  const projectId = job.data.projectId
  try {
    await ProjectService.initiateProjectClosure({
      projectId,
      reason: 'Project expired'
    })

    logger.log('closed project', { project: projectId })

    return { message: 'closed project ' + projectId }
  } catch (err: any) {
    logger.error('error closing expired project', {
      message: err.message,
      project: projectId
    })

    throw err
  }
}

async function fetchExpiredProjects(job: Job) {
  const logger = new Logger('fetch-expired-projects')

  const projects = await Project.find({
    status: ProjectStatus.Active,
    expiry: { $lte: new Date() }
  })
    .select('_id').lean()

  logger.log('fetched projects', { projects: projects.length })
  if (!projects.length) {
    return { message: 'no expired projects found' }
  }

  const bulk = projects.map((project) => ({
    name: 'closeExpiredProject',
    data: { projectId: project._id },
  }))

  await job.queue.addBulk(bulk)

  return { message: 'queued expired projects' }
}

export {
  fetchExpiredProjects,
  closeExpiredProject
}