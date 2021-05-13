import { config as dotenv } from "dotenv";

dotenv();

export const config = () => {
  const envs = process.env as any;
  return {
    GEB_SUBGRAPH_URL: envs.GEB_SUBGRAPH_URL,
    RPC_URL: envs.RPC_URL,
    START_BLOCK: Number(envs.START_BLOCK),
    END_BLOCK: Number(envs.END_BLOCK),
    REWARD_AMOUNT: Number(envs.REWARD_AMOUNT),
  };
};
