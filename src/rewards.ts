import { config } from "./config";
import { getAccumulatedRate, getPoolState } from "./initial-state";
import { RewardEvent, RewardEventType, UserAccount, UserList } from "./types";
import { getOrCreateUser, NULL_ADDRESS, roundToZero } from "./utils";
import { provider } from "./chain";
import { finalSanityChecks, sanityCheckAllUsers } from "./sanity-checks";

export const processRewardEvent = async (
  users: UserList,
  events: RewardEvent[]
): Promise<UserList> => {
  // Starting and ending of the campaign
  const startBlock = config().START_BLOCK;
  const endBlock = config().END_BLOCK;
  const startTimestamp = (await provider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await provider.getBlock(endBlock)).timestamp;

  // Constant amount of reward distributed per second
  const rewardRate = config().REWARD_AMOUNT / (endTimestamp - startTimestamp);

  // Ongoing Total supply of weight
  let totalStakingWeight = sumAllWeights(users);

  // Ongoing cumulative reward per weight over time
  let rewardPerWeight = 0;

  let updateRewardPerWeight = (evtTime) => {
    if (totalStakingWeight > 0) {
      const deltaTime = evtTime - timestamp;
      rewardPerWeight += (deltaTime * rewardRate) / totalStakingWeight;
    }
  };

  // Ongoing time
  let timestamp = startTimestamp;

  // Ongoing accumulated rate
  let accumulatedRate = await getAccumulatedRate(startBlock);

  // Ongoing RAI reserve and LP total supply, this is needed to convert LP balance to RAI LP Balance
  let { uniRaiReserve, totalLpSupply } = await getPoolState(startBlock);

  // ===== Main processing loop ======

  console.log(
    `Distributing ${
      config().REWARD_AMOUNT
    } at a reward rate of ${rewardRate}/sec between ${startTimestamp} and ${endTimestamp}`
  );
  console.log("Applying all events...");
  // Main processing loop processing events in chronologic order that modify the current reward rate distribution for each user.
  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} events`);

    // Update the cumulative reward per weight
    updateRewardPerWeight(event.timestamp);

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

          // Convert LP amount to RAI-LP amount
          user.raiLpBalance = (uniRaiReserve * user.lpBalance) / totalLpSupply;
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
            (u.raiLpBalance = (u.lpBalance * uniRaiReserve) / totalLpSupply)
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

    sanityCheckAllUsers(users, event);

    // Recalculate the sum of weights since the events changed the totalSupply of weights
    Object.values(users).map(
      (u) => (u.stakingWeight = Math.min(u.debt, u.raiLpBalance))
    );
    totalStakingWeight = sumAllWeights(users);

    if (totalStakingWeight === 0) {
      console.log(`Zero weight at event ${i} time ${event.timestamp}`);
    }
  }

  // Final crediting of all rewards
  updateRewardPerWeight(endTimestamp);
  Object.values(users).map((u) => earn(u, rewardPerWeight));

  // Sanity check
  finalSanityChecks(
    timestamp,
    accumulatedRate,
    totalLpSupply,
    uniRaiReserve,
    users,
    endBlock
  );

  return users;
};

// Credit reward to a user
const earn = (user: UserAccount, rewardPerWeight: number) => {
  // Credit to the user his due rewards
  user.earned +=
    (rewardPerWeight - user.rewardPerWeightStored) * user.stakingWeight;

  // Store his cumulative credited rewards for next time
  user.rewardPerWeightStored = rewardPerWeight;
};

// Simply sum all the stakingWeight of all users
const sumAllWeights = (users: UserList) =>
  Object.values(users).reduce((acc, user) => acc + user.stakingWeight, 0);
