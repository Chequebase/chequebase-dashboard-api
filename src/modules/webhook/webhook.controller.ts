import { Body, Controller, HeaderParams, Post } from "routing-controllers";
import { Service } from "typedi";

@Service()
@Controller('/webhook', { transformResponse: false })
export default class WebhookController {
  @Post('anchor')
  processAnchor(@Body() body: any, @HeaderParams() headers: any) {
    console.log('received anchor webhook', {
      body: JSON.stringify(body),
      headers: JSON.stringify(headers)
    })

    return { message: 'received' }
  }
}