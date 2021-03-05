import { RewardEvent, UserAccount, UserList } from "./types";
import * as fs from "fs";

export const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

export const getOrCreateUser = (
  address: string,
  userList: UserList
): UserAccount => {
  if (userList[address]) {
    return userList[address];
  } else {
    const newUser = {
      debt: 0,
      lpBalance: 0,
      raiLpBalance: 0,
      stakingWeight: 0,
      earned: 0,
      rewardPerWeightStored: 0,
    };
    userList[address] = newUser;
    return newUser;
  }
};

export const lpBalanceToRaiLpBalance = (
  lpBalance: number,
  uniRaiReserve: number,
  lpTotalSupply: number
) => (lpBalance * uniRaiReserve) / lpTotalSupply;

export const sanityCheck = (users: UserList, event: RewardEvent) => {
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

export const roundToZero = (num: number) => (Math.abs(num) < 1e10 ? 0 : num);

// Export results in a CSV file
export const exportResults = (users: UserList) => {
  // Export results in an array
  let userReward: [string, number][] = Object.entries(users).map((kv) => [
    kv[0],
    kv[1].earned,
  ]);

  // Remove users with 0 rewards
  userReward = userReward.filter((x) => x[1] > 0);

  // Sort by decreasing reward
  userReward = userReward.sort((a, b) =>
    a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1
  );

  // CSV dump
  let w = "Address,Reward\n";
  for (let u of userReward) {
    w += `${u[0]},${u[1]}\n`;
  }
  fs.writeFileSync("reward.csv", w);
};
