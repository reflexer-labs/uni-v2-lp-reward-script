import { config as dotenv } from "dotenv";

dotenv();

export const config = () => {
  const envs = process.env as any;
  return {
    SUBGRAPH_URL: envs.SUBGRAPH_URL,
    RPC_URL: envs.RPC_URL,
    START_BLOCK: Number(envs.START_BLOCK),
    END_BLOCK: Number(envs.END_BLOCK),
  };
};
