import { getAccumulatedRate, getPoolState } from "./initial-state";
import { NULL_ADDRESS, roundToZero } from "./utils";
import { provider } from "./chain";
import { RewardEvent, UserList } from "./types";

export const finalSanityChecks = async (
  finalTimestamp: number,
  finalAccumulatedRate: number,
  finalTotalLpSupply: number,
  finalUniRaiReserve: number,
  finalUsers: UserList,
  endBlock: number
) => {
  const endTimestamp = (await provider.getBlock(endBlock)).timestamp;
  if (finalTimestamp > endTimestamp) {
    throw Error("Impossible final timestamp");
  }

  const expectedAccumulatedRate = await getAccumulatedRate(endBlock);
  if (roundToZero(expectedAccumulatedRate - finalAccumulatedRate)) {
    throw Error(
      `Invalid final accumulated rate. Get ${finalAccumulatedRate} expected ${expectedAccumulatedRate}`
    );
  }

  const finalPoolState = await getPoolState(endBlock);
  if (
    roundToZero(finalPoolState.totalLpSupply - finalTotalLpSupply) ||
    roundToZero(finalPoolState.uniRaiReserve - finalUniRaiReserve)
  ) {
    throw Error(
      `Invalid final pool state.
      Expected uniRaiReserve ${finalPoolState.uniRaiReserve} get ${finalUniRaiReserve}
      Expected totalLpSupply ${finalPoolState.totalLpSupply} get ${finalTotalLpSupply}`
    );
  }

  // Check how much rewards were allocated
  const totalAllocatedReward = Object.values(finalUsers).reduce(
    (acc, a) => (acc += a.earned),
    0
  );
  console.log(
    `All events applied, total allocated reward ${totalAllocatedReward}`
  );
};

export const sanityCheckAllUsers = (users: UserList, event: RewardEvent) => {
  const numberCheck = (num) => !isFinite(num) || num < 0;
  if (event.address && event.address !== NULL_ADDRESS) {
    const usr = users[event.address];
    if (
      numberCheck(usr.debt) ||
      numberCheck(usr.lpBalance) ||
      numberCheck(usr.raiLpBalance) ||
      numberCheck(usr.stakingWeight) ||
      numberCheck(usr.earned) ||
      numberCheck(usr.rewardPerWeightStored)
    ) {
      throw Error(
        `Invalid user:\n${JSON.stringify(usr)}\n at event:\n${JSON.stringify(
          event
        )}`
      );
    }
  }
};
