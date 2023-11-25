import { Token } from "typedi";
import { ANCHOR_TOKEN } from "./providers/anchor.client";
import { TransferClientName } from "./providers/transfer.client";

const ProviderRegistry = new Map<string, Token<string>>();
ProviderRegistry.set(TransferClientName.Anchor, ANCHOR_TOKEN);

export default ProviderRegistry