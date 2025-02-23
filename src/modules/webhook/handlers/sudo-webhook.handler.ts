import Logger from "@/modules/common/utils/logger";
import { CardClientName } from "@/modules/external-providers/card/providers/card.client";
import { OrganizationCardService } from "@/modules/organization-card/organization-card.service";
import numeral from "numeral";
import { Service } from "typedi";

@Service()
export default class SudoWebhookHandler {
  private logger = new Logger(SudoWebhookHandler.name);

  constructor(
    private orgCardService: OrganizationCardService,
  ) {}

  private async onAuthorizationRequest(body: any) {
    const card = body.data.object.card;
    const pendingRequest = body.data.object.pendingRequest

    const result = await this.orgCardService.authorizeCardCharge({
      amount: pendingRequest.amount,
      provider: CardClientName.Sudo,
      providerRef: card._id
    })
    
    return {
      statusCode: result.code === '00' ? 200 : 400,
      responseCode: result.code,
      data: result
    }
  }

  async onBalanceEnquiry(body: any) {
    const card = body.data.object
    const balance = await this.orgCardService.getCardBalance(
      CardClientName.Sudo,
      card._id
    );

    return {
      statusCode: 200,
      responseCode: "00",
      data: {
        balance: numeral(balance.amount).divide(100).value(),
      },
    };
  }

  processWebhook(body: any) {
    const { data, type } = body;
    if (!allowedWebooks.includes(type)) {
      this.logger.log("event type not allowedd", { event: type });
      return { message: "webhook_logged" };
    }

    switch (type as (typeof allowedWebooks)[number]) {
      case "card.balance":
        return this.onBalanceEnquiry(body);
      case "authorization.request":
        return this.onAuthorizationRequest(body);
      default:
        this.logger.log("unhandled event", { event: data.type });
        break;
    }

    return { message: "webhook_handled" };
  }
}

const allowedWebooks = ["card.balance", "authorization.request"] as const;


const webhook = {
  "environment": "development",
  "business": "61cc42a046996fb949322a3e",
  "data": {
    "object": {
      "_id": "61d8f42bc46018873905a955",
      "business": "61cc42a046996fb949322a3e",
      "customer": {
        "_id": "61ccdc228ce8d1fe6dceacf9",
        "business": "61cc42a046996fb949322a3e",
        "type": "individual",
        "name": "John Doe",
        "status": "active",
        "individual": {
          "firstName": "John",
          "lastName": "Doe",
          "_id": "61ccdc228ce8d1fe6dceacfa"
        },
        "billingAddress": {
          "line1": "4 Barnawa Close",
          "line2": "Off Challawa Crescent",
          "city": "Barnawa",
          "state": "Kaduna",
          "country": "Nigeria",
          "postalCode": "800243",
          "_id": "61ccdc228ce8d1fe6dceacfb"
        },
        "isDeleted": false,
        "createdAt": "2021-12-29T22:07:30.301Z",
        "updatedAt": "2021-12-29T22:07:30.301Z",
        "__v": 0
      },
      "account": {
        "_id": "61ce491d9400b25b439ae424",
        "business": "61cc42a046996fb949322a3e",
        "type": "wallet",
        "currency": "NGN",
        "accountName": "SUDO / JOHN DOE",
        "bankCode": "999240",
        "accountType": "Current",
        "accountNumber": "8016065912",
        "currentBalance": 0,
        "availableBalance": 0,
        "provider": "SafeHaven",
        "providerReference": "61ce491d3153ed001e8425e2",
        "referenceCode": "subacc_1640909083619",
        "isDefault": true,
        "isDeleted": false,
        "createdAt": "2021-12-31T00:04:45.657Z",
        "updatedAt": "2021-12-31T00:04:45.657Z",
        "__v": 0
      },
      "card": {
        "_id": "61ce491d9400b25b439ae426",
        "business": "61cc42a046996fb949322a3e",
        "customer": "61ccdc228ce8d1fe6dceacf9",
        "account": "61ce491d9400b25b439ae424",
        "fundingSource": {
          "_id": "61ccdc118ce8d1fe6dceacf0",
          "business": "61cc42a046996fb949322a3e",
          "type": "gateway",
          "status": "active",
          "jitGateway": {
            "url": "https://AfraidRoughRedundancy.aminubakori.repl.co/sudo/jitgateway",
            "authorizationHeader": "Bearer ACME_TOKEN",
            "authorizeByDefault": false,
            "_id": "61ccdc118ce8d1fe6dceacf1"
          },
          "isDefault": false,
          "isDeleted": false,
          "createdAt": "2021-12-29T22:07:13.392Z",
          "updatedAt": "2021-12-29T22:07:13.392Z",
          "__v": 0
        },
        "type": "physical",
        "brand": "Verve",
        "currency": "NGN",
        "maskedPan": "444444******4430",
        "expiryMonth": "01",
        "expiryYear": "2025",
        "status": "active",
        "spendingControls": {
          "channels": {
            "atm": true,
            "pos": true,
            "web": true,
            "mobile": true,
            "_id": "61ce491d9400b25b439ae428"
          },
          "allowedCategories": [

          ],
          "blockedCategories": [

          ],
          "spendingLimits": [
            {
              "amount": 1000,
              "interval": "daily",
              "categories": [

              ],
              "_id": "61ce491d9400b25b439ae429"
            }
          ],
          "_id": "61ce491d9400b25b439ae427"
        },
        "isDeleted": false,
        "createdAt": "2021-12-31T00:04:45.840Z",
        "updatedAt": "2021-12-31T00:04:45.840Z",
        "__v": 0
      },
      "amount": 0,
      "fee": 5,
      "vat": 0.375,
      "approved": false,
      "currency": "NGN",
      "status": "pending",
      "authorizationMethod": "online",
      "balanceTransactions": [

      ],
      "merchantAmount": 20,
      "merchantCurrency": "NGN",
      "merchant": {
        "category": "6010",
        "name": "SUDO SIMULATOR",
        "merchantId": "SUDOSIMULATOR01",
        "city": "JAHI",
        "state": "ABUJA",
        "country": "NG",
        "postalCode": "100001",
        "_id": "61d8f42bc46018873905a956"
      },
      "terminal": {
        "rrn": "126769857082",
        "stan": "192208",
        "terminalId": "3SUDOSIM",
        "terminalOperatingEnvironment": "on_premise",
        "terminalAttendance": "unattended",
        "terminalType": "ecommerce",
        "panEntryMode": "keyed_in",
        "pinEntryMode": "keyed_in",
        "cardHolderPresence": true,
        "cardPresence": true,
        "_id": "61d8f42bc46018873905a957"
      },
      "transactionMetadata": {
        "channel": "web",
        "type": "purchase",
        "reference": "0123456783126769857082",
        "_id": "61d8f42bc46018873905a958"
      },
      "pendingRequest": {
        "amount": 25.375,
        "currency": "NGN",
        "merchantAmount": 20,
        "merchantCurrency": "NGN",
        "_id": "61d8f42bc46018873905a959"
      },
      "requestHistory": [

      ],
      "verification": {
        "billingAddressLine1": "not_provided",
        "billingAddressPostalCode": "not_provided",
        "cvv": "match",
        "expiry": "match",
        "pin": "match",
        "threeDSecure": "not_provided",
        "safeToken": "not_provided",
        "authentication": "pin",
        "_id": "61d8f42bc46018873905a95a"
      },
      "isDeleted": false,
      "createdAt": "2022-01-08T02:17:15.075Z",
      "updatedAt": "2022-01-08T02:17:15.075Z",
      "feeDetails": [
        {
          "contract": "61a18b8a4ddab599d20344a7",
          "currency": "NGN",
          "amount": 5,
          "description": "Verve Card Authorization Fee",
          "_id": "61d8f42bc46018873905a95b"
        }
      ],
      "__v": 0
    },
    "_id": "61d8f42bc46018873905a96f",
    "changes": " {\n-  amount: 0\n+  amount: 25.375\n-  approved: false\n+  approved: true\n-  status: \"pending\"\n+  status: \"approved\"\n-  pendingRequest: {\n-    amount: 25.375\n-    currency: \"NGN\"\n-    merchantAmount: 20\n-    merchantCurrency: \"NGN\"\n-    _id: \"61d8f42bc46018873905a959\"\n-  }\n+  pendingRequest: null\n   requestHistory: [\n+    {\n+      amount: 25.375\n+      currency: \"NGN\"\n+      approved: true\n+      merchantAmount: 20\n+      merchantCurrency: \"NGN\"\n+      reason: \"webhook_approved\"\n+      createdAt: \"2022-01-08T02:17:15.075Z\"\n+      _id: \"61d8f42cc46018873905a979\"\n+    }\n   ]\n }\n"
  },
  "type": "authorization.request",
  "pendingWebhook": false,
  "webhookArchived": false,
  "createdAt": 1641608235,
  "_id": "61d8f42bc46018873905a96e"
}