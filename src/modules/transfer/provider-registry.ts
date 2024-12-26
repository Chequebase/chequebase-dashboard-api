import { Token } from "typedi";
import { ANCHOR_TOKEN } from "./providers/anchor.client";
import { SAREPAY_TOKEN } from "./providers/sarepay.client";
import { TransferClientName } from "./providers/transfer.client";
import { SAFE_HAVEN_TRANSFER_TOKEN } from "./providers/safe-haven.client";
import { MONO_TOKEN } from "./providers/mono.client";

const ProviderRegistry = new Map<string, Token<string>>();
ProviderRegistry.set(TransferClientName.Anchor, ANCHOR_TOKEN);
ProviderRegistry.set(TransferClientName.SafeHaven, SAFE_HAVEN_TRANSFER_TOKEN);
ProviderRegistry.set(TransferClientName.SarePay, SAREPAY_TOKEN);
ProviderRegistry.set(TransferClientName.Mono, MONO_TOKEN);

export default ProviderRegistry