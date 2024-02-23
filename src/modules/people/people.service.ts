import Logger from "../common/utils/logger"
import { Service } from "typedi"
import { CreateDepartmentDto } from "./dto/people.dto"
import Department from "@/models/department.model"
import User from "@/models/user.model"
import { BadRequestError } from "routing-controllers"

const logger = new Logger('people-service')

@Service()
export class PeopleService {
  async createDepartment(orgId: string, payload: CreateDepartmentDto) {
    const department = await Department.create({
      organization: orgId,
      name: payload.name,
      manager: payload.manager,
      budgets: payload.budgets,
    })

    if (payload.members?.length) {
      await User.updateMany({ _id: { $in: payload.members }, organization: orgId }, {
        $addToSet: { departments: department._id }
      })
    }

    return department
  }

  async editDepartment(orgId: string, departmentId: string, payload: CreateDepartmentDto) {
    const department = await Department.findOneAndUpdate({ _id: departmentId, organization: orgId }, {
      manager: payload.manager,
      budgets: payload.budgets,
    }, { new: true })

    if (!department) {
      throw new BadRequestError('Department not found')
    }

    if (payload.members?.length) {
      await User.updateMany({ _id: { $in: payload.members }, organization: orgId }, {
        $addToSet: { departments: department._id }
      })
    }

    return department
  }

  async deleteDepartment(orgId: string, departmentId: string) {
    const department = await Department.findOneAndDelete({ _id: departmentId, organization: orgId })
    if (!department) {
      throw new BadRequestError('Department not found')
    }

    await User.updateMany({ organization: orgId }, {
      $pull: { departments: department }
    })

    return { message: 'Department deleted successfully' }
  }
}