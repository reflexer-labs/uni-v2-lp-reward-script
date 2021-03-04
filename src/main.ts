import { config } from "./config";
import { getAccumulatedRate, getInitialState } from "./initial-state";
import { RewardEventType, UserList } from "./types";
import { getEvents } from "./get-events";
import { updateAllStakingWeights, updateStakingWeight } from "./utils";

const main = async () => {
  const users: UserList = await getInitialState(config().START_BLOCK);
  const events = await getEvents(config().START_BLOCK, config().END_BLOCK);

  let accumulatedRate = await getAccumulatedRate(config().START_BLOCK);

  // Main processing loop
  for (let event of events) {
    switch (event.type) {
      case RewardEventType.DELTA_DEBT:
        const adjustedDebt = event.value * accumulatedRate;
        users[event.address].debt += adjustedDebt;
        updateStakingWeight(users[event.address]);
        break;
      case RewardEventType.DELTA_LP:
        users[event.address].raiLPBalance += event.value;
        break;
      case RewardEventType.POOL_SYNC:
        break;
      case RewardEventType.UPDATE_ACCUMULATED_RATE:
        accumulatedRate += event.value;
        break;
      default:
        throw Error("Unknown event");
    }
  }
};

main();
