import { Token } from "typedi";
import { ANCHOR_TOKEN } from "./providers/anchor.client";
import { VirtualAccountClientName } from "./providers/virtual-account.client";

const ProviderRegistry = new Map<string, Token<string>>();
ProviderRegistry.set(VirtualAccountClientName.Anchor, ANCHOR_TOKEN);

export default ProviderRegistry