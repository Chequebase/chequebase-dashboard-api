import { JsonController } from 'routing-controllers';
import { Service } from 'typedi';
import { PeopleService } from './people.service';

@Service()
@JsonController('/people', { transformResponse: false })
export default class PeopleController {
  constructor (private readonly peopleService: PeopleService) { }

}
