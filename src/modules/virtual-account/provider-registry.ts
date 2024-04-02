import { Token } from "typedi";
import { ANCHOR_TOKEN } from "./providers/anchor.client";
import { VirtualAccountClientName } from "./providers/virtual-account.client";
import { PAYSTACK_TOKEN } from "./providers/paystack.client";

const ProviderRegistry = new Map<string, Token<string>>();
ProviderRegistry.set(VirtualAccountClientName.Anchor, ANCHOR_TOKEN);
ProviderRegistry.set(VirtualAccountClientName.Paystack, PAYSTACK_TOKEN);

export default ProviderRegistry