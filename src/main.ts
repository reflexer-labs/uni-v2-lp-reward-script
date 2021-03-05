import { config } from "./config";
import {
  getAccumulatedRate,
  getInitialState,
  getPoolState,
} from "./initial-state";
import { RewardEventType, UserAccount, UserList } from "./types";
import { getEvents } from "./get-events";
import {
  exportResults,
  getOrCreateUser,
  lpBalanceToRaiLpBalance,
  NULL_ADDRESS,
  roundToZero,
  sanityCheck,
} from "./utils";
import { provider } from "./chain";

const main = async () => {
  // Starting and ending of the campaign
  const startBlock = config().START_BLOCK;
  const endBlock = config().END_BLOCK;
  const startTimestamp = (await provider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await provider.getBlock(endBlock)).timestamp;

  // Constant amount of reward distributed per second
  const rewardRate = config().REWARD_AMOUNT / (endTimestamp - startTimestamp);

  // List of all users with their parameters
  const users: UserList = await getInitialState(startBlock);

  // All event modifying the reward state
  const events = await getEvents(startBlock, endBlock);

  // Ongoing Total supply of weight
  let totalStakingWeight = sumAllWeights(users);

  // Ongoing cumulative reward per weight over time
  let rewardPerWeight = 0;

  // Ongoing time
  let timestamp = startTimestamp;

  // Ongoing accumulated rate
  let accumulatedRate = await getAccumulatedRate(startBlock);

  // Ongoing RAI reserve and LP total supply, this is needed to convert LP balance to RAI LP Balance
  let { uniRaiReserve, totalLpSupply } = await getPoolState(startBlock);

  // ===== Main processing loop ======

  console.log("Applying all events...");
  // Main processing loop processing events in chronologic order that modify the current reward rate distribution for each user.
  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} events`);

    // Time passed since last event
    const deltaTime = event.timestamp - timestamp;

    // Update the cumulative reward per weight
    rewardPerWeight =
      rewardPerWeight +
      (totalStakingWeight > 0
        ? (deltaTime * rewardRate) / totalStakingWeight
        : 0);

    // Increment time
    timestamp = event.timestamp;

    // The way the rewards are credited is different for each event type
    switch (event.type) {
      case RewardEventType.DELTA_DEBT: {
        const user = getOrCreateUser(event.address, users);
        earn(user, rewardPerWeight);

        // Convert to real debt after interests and update the debt balance
        const adjustedDeltaDebt = event.value * accumulatedRate;
        user.debt += adjustedDeltaDebt;
        break;
      }
      case RewardEventType.DELTA_LP: {
        if (event.address === NULL_ADDRESS) {
          // This is a mint or a burn of LP tokens, update the total supply
          totalLpSupply += -1 * event.value;

          if (totalLpSupply < 0) {
            throw Error("Negative lp total supply");
          }
        } else {
          // Credit user rewards
          const user = getOrCreateUser(event.address, users);
          earn(user, rewardPerWeight);

          user.lpBalance = roundToZero(user.lpBalance + event.value);

          // Convert LP amount to RAI-LP amount and update RAI-LP balance
          user.raiLpBalance = roundToZero(
            user.raiLpBalance + (uniRaiReserve * event.value) / totalLpSupply
          );

          sanityCheck(users, event);
        }
        break;
      }
      case RewardEventType.POOL_SYNC: {
        // Pool sync are either swap or LP mint/burn. It's changing the RAI reserve of the pool
        // We have to recalculate all the staking weights because this will shift the LP-RAI balance
        uniRaiReserve = event.value;

        // First credit all users
        Object.values(users).map((u) => earn(u, rewardPerWeight));

        // Then update everyone's RAI-LP balance according to the new RAI reserve
        Object.values(users).map(
          (u) =>
            (u.raiLpBalance = lpBalanceToRaiLpBalance(
              u.lpBalance,
              uniRaiReserve,
              totalLpSupply
            ))
        );
        break;
      }
      case RewardEventType.UPDATE_ACCUMULATED_RATE: {
        // Update accumulated rate increases everyone's debt by the rate multiplier
        const rateMultiplier = event.value;
        accumulatedRate += rateMultiplier;

        // First credit all users
        Object.values(users).map((u) => earn(u, rewardPerWeight));

        // Update everyone's debt
        Object.values(users).map((u) => (u.debt *= rateMultiplier + 1));
        break;
      }
      default:
        throw Error("Unknown event");
    }

    sanityCheck(users, event);

    // Recalculate the sum of weights since the events changed the totalSupply of weights
    totalStakingWeight = sumAllWeights(users);
  }
  const totalAllocatedReward = Object.values(users).reduce(
    (acc, a) => (acc += a.earned),
    0
  );
  console.log(
    `All events applied, total allocated reward ${totalAllocatedReward}`
  );

  // Final crediting of all rewards
  Object.values(users).map((u) => earn(u, rewardPerWeight));

  // Write results in file
  exportResults(users);
};

// Credit reward to a user
const earn = (user: UserAccount, rewardPerWeight: number) => {
  if (user.debt < 0) {
    throw Error(`Negative debt, ${JSON.stringify(user)}`);
  }

  if (user.lpBalance < 0) {
    throw Error("Negative lpBalance");
  }

  if (user.raiLpBalance < 0) {
    throw Error("Negative raiLpBalance");
  }

  // Calculate the user reward weight
  user.stakingWeight = Math.min(user.debt, user.raiLpBalance);

  // Credit to the user his due rewards
  user.earned +=
    (rewardPerWeight - user.rewardPerWeightStored) * user.stakingWeight;

  if (rewardPerWeight - user.rewardPerWeightStored < 0) {
    throw Error(`Negative earnings ${JSON.stringify(user)}`);
  }

  // Store his cumulative credited rewards for next time
  user.rewardPerWeightStored = rewardPerWeight;
};

// Simply sum all the stakingWeight of all users
const sumAllWeights = (users: UserList) =>
  Object.values(users).reduce((acc, user) => acc + user.stakingWeight, 0);

// Start..
main();
