import { config } from "./config";
import { getInitialState } from "./initial-state";
import { UserList } from "./types";

const main = async () => {
  const users: UserList = await getInitialState(Number(config.START_BLOCK));
};

main();
