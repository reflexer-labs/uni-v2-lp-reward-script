// For a single user
export type UserAccount = {
  lpBalance: number;
  stakingWeight: number;
  rewardPerWeightStored: number;
  earned: number;
};

// Main data structure
export type UserList = {
  [address: string]: UserAccount;
};

export enum RewardEventType {
  DELTA_LP,
  POOL_SYNC,
}

export type RewardEvent = {
  type: RewardEventType;
  address?: string;
  value: number;
  timestamp: number;
  logIndex: number;
};
