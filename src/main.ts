import { config } from "./config";
import { getEvents } from "./get-events";
import { getInitialState } from "./initial-state";
import { processRewardEvent } from "./rewards";
import { UserList } from "./types";
import { exportResults } from "./utils";

const main = async () => {
  // List of all users with their parameters
  const users: UserList = await getInitialState(
    config().START_BLOCK,
    config().END_BLOCK
  );

  // All event modifying the reward state
  const events = await getEvents(config().START_BLOCK, config().END_BLOCK);

  // Apply all reward event to users
  await processRewardEvent(users, events);

  // Write results in file
  exportResults(users);
};

// Start..
main();
