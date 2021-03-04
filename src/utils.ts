import { UserAccount, UserList } from "./types";

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
      raiLPBalance: 0,
      stakingWeight: 0,
      lastUpdated: 0,
    };
    userList[address] = newUser;
    return newUser;
  }
};

export const updateAllStakingWeights = (userList: UserList) => {
  // Update all account with the rule min(lp balance, debt)
  Object.values(userList).map((x) => {
    x.stakingWeight = Math.min(x.debt, x.raiLPBalance);
  });
};

export const updateStakingWeight = (user: UserAccount) => {
  user.stakingWeight = Math.min(user.debt, user.raiLPBalance);
};
