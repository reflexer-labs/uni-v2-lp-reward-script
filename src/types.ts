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

export enum RewardEventType {
  DELTA_DEBT,
  DELTA_LP,
  POOL_SYNC,
  UPDATE_ACCUMULATED_RATE,
}

export type RewardEvent = {
  type: RewardEventType;
  address?: string;
  value: number;
  timestamp: number;
  logIndex: number;
};
