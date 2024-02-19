import Logger from "../common/utils/logger"
import { Service } from "typedi"
import { CreateDepartmentDto } from "./dto/people.dto"

const logger = new Logger('people-service')

@Service()
export class PeopleService {
  createDepartment(payload: CreateDepartmentDto) {
  }
}