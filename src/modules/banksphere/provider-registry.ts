import { Token } from "typedi";
import { ANCHOR_TOKEN } from "./providers/anchor.client";
import { CustomerClientName } from "./providers/customer.client";

const ProviderRegistry = new Map<string, Token<string>>();
ProviderRegistry.set(CustomerClientName.Anchor, ANCHOR_TOKEN);

export default ProviderRegistry