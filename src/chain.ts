import { providers } from "ethers";
import { config } from "./config";

export const provider = new providers.StaticJsonRpcProvider(config().RPC_URL);
