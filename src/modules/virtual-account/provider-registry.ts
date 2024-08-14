import { Token } from "typedi";
import { ANCHOR_TOKEN } from "./providers/anchor.client";
import { PAYSTACK_TOKEN } from "./providers/paystack.client";
import { SAREPAY_TOKEN } from "./providers/sarepay.client";
import { VirtualAccountClientName } from "./providers/virtual-account.client";

const ProviderRegistry = new Map<string, Token<string>>();
ProviderRegistry.set(VirtualAccountClientName.Anchor, ANCHOR_TOKEN);
ProviderRegistry.set(VirtualAccountClientName.Paystack, PAYSTACK_TOKEN);
ProviderRegistry.set(VirtualAccountClientName.SarePay, SAREPAY_TOKEN);

export default ProviderRegistry