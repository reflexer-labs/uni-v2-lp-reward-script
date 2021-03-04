import { config as dotenv } from "dotenv";

dotenv();

type Config = {
  SUBGRAPH_URL: string;
  START_BLOCK: string;
  END_BLOCK: string;
  RPC_URL: string;
};

export const config = (process.env as any) as Config;
