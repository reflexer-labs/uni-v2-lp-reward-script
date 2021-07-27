import { config } from "./config";
import { getEvents } from "./get-events";
import { getInitialState } from "./initial-state";
import { processRewardEvent } from "./rewards";
import { UserList } from "./types";
import { exportResults, getSafeOwnerMapping } from "./utils";

const main = async () => {
  // Get end user owners of safe handle
  const owners = await getSafeOwnerMapping(config().END_BLOCK);

  // List of all users with their parameters
  const users: UserList = await getInitialState(config().START_BLOCK, config().END_BLOCK, owners);

  // All event modifying the reward state
  const events = await getEvents(config().START_BLOCK, config().END_BLOCK, owners);

  // Apply all reward event to users
  await processRewardEvent(users, events);

  // Write results in file
  exportResults(users);
};

// Start..
main();
