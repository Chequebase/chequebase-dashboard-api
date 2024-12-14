import { Token } from "typedi";
import { CardClientName } from "./providers/card.client";
import { SUDO_CARD_TOKEN } from "./providers/sudo.client";

const ProviderRegistry = new Map<string, Token<string>>();
ProviderRegistry.set(CardClientName.Sudo, SUDO_CARD_TOKEN);

export default ProviderRegistry