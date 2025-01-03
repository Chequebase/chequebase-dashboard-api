import { Token } from "typedi";
import { ANCHOR_TOKEN } from "./providers/anchor.client";
import { CustomerClientName } from "./providers/customer.client";
import { MONO_TOKEN } from "./providers/mono.client";

const ProviderRegistry = new Map<string, Token<string>>();
ProviderRegistry.set(CustomerClientName.Anchor, ANCHOR_TOKEN);
ProviderRegistry.set(CustomerClientName.Mono, MONO_TOKEN);

export default ProviderRegistry