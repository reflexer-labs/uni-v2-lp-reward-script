import { config } from "./config";
import { getInitialState } from "./initial-state";
import { UserList } from "./types";
import { getEvents } from "./get-events";

const main = async () => {
  // const users: UserList = await getInitialState(config().START_BLOCK);

  const events = await getEvents(config().START_BLOCK, config().END_BLOCK);
};

main();
