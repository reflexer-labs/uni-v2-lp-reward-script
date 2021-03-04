// For a single user
export type UserAccount = {
  debt: number;
  raiLPBalance: number;
  stakingWeight: number;
  lastUpdated: number;
};

// Main data structure
export type UserList = {
  [address: string]: UserAccount;
};
