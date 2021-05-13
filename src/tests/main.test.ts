import { expect } from "chai";
import { type } from "node:os";
import { ImportMock } from "ts-mock-imports";

import { processRewardEvent } from "../rewards";
import { RewardEvent, RewardEventType, UserList } from "../types";
import * as Config from "../config";
import * as InitialState from "../initial-state";
import * as Chain from "../chain";

describe("processRewardEvent", async () => {
  const configStub = ImportMock.mockFunction(Config, "config", {
    GEB_SUBGRAPH_URL: "",
    RPC_URL: "",
    START_BLOCK: 5,
    END_BLOCK: 15,
    REWARD_AMOUNT: 10,
  });

  ImportMock.mockOther(InitialState, "getAccumulatedRate", async (b) => 1);
  ImportMock.mockOther(InitialState, "getPoolState", async (b) => ({
    uniRaiReserve: 100,
    totalLpSupply: 20,
  }));

  ImportMock.mockOther(Chain, "provider", {
    // @ts-ignore
    getBlock: async (b) => ({
      timestamp: b,
    }),
  });

  it("Constant distribution with 2 users", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpBalance: 10,
        raiLpBalance: 10,
        stakingWeight: 10,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 30,
        lpBalance: 30,
        raiLpBalance: 30,
        stakingWeight: 30,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    const events: RewardEvent[] = [];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].earned).equal(2.5);
    expect(users["Bob"].earned).equal(7.5);
    expect(users["Alice"].stakingWeight).equal(10);
    expect(users["Bob"].stakingWeight).equal(30);
  });

  it("Add/remove/add debt alone with high prior LP", async () => {
    let users: UserList = {
      Alice: {
        debt: 0,
        lpBalance: 15,
        raiLpBalance: (15 * 100) / 15,
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    const events: RewardEvent[] = [
      {
        type: RewardEventType.DELTA_DEBT,
        address: "Bob",
        value: 10,
        timestamp: 6,
        logIndex: 0,
      },
      {
        type: RewardEventType.DELTA_DEBT,
        address: "Alice",
        value: 10,
        timestamp: 8,
        logIndex: 0,
      },
      {
        type: RewardEventType.DELTA_DEBT,
        address: "Alice",
        value: -10,
        timestamp: 10,
        logIndex: 0,
      },
      {
        type: RewardEventType.DELTA_DEBT,
        address: "Alice",
        value: 10,
        timestamp: 12,
        logIndex: 0,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].stakingWeight).equal(10);
    expect(users["Bob"].stakingWeight).equal(0);
    expect(users["Alice"].earned).equal(5);
    expect(users["Bob"].earned).equal(0);
  });

  it("Add/remove/add debt while bob is there", async () => {
    let users: UserList = {
      Alice: {
        debt: 0,
        lpBalance: 10,
        raiLpBalance: 10,
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpBalance: 10,
        raiLpBalance: 10,
        stakingWeight: 10,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    const events: RewardEvent[] = [
      {
        type: RewardEventType.DELTA_DEBT,
        address: "Alice",
        value: 10,
        timestamp: 8,
        logIndex: 0,
      },
      {
        type: RewardEventType.DELTA_DEBT,
        address: "Alice",
        value: -10,
        timestamp: 10,
        logIndex: 0,
      },
      {
        type: RewardEventType.DELTA_DEBT,
        address: "Alice",
        value: 10,
        timestamp: 12,
        logIndex: 0,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].stakingWeight).equal(10);
    expect(users["Bob"].stakingWeight).equal(10);
    expect(users["Alice"].earned).closeTo(2.5, 0.00001);
    expect(users["Bob"].earned).closeTo(7.5, 0.00001);
  });

  it("Add/remove/add lp while bob is there", async () => {
    let users: UserList = {
      Alice: {
        debt: 0,
        lpBalance: 10,
        raiLpBalance: 10,
        stakingWeight: 0,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpBalance: 10,
        raiLpBalance: 10,
        stakingWeight: 10,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    const events: RewardEvent[] = [
      {
        type: RewardEventType.DELTA_DEBT,
        address: "Alice",
        value: 10,
        timestamp: 8,
        logIndex: 0,
      },
      {
        type: RewardEventType.DELTA_LP,
        address: "Alice",
        value: -10,
        timestamp: 10,
        logIndex: 0,
      },
      {
        type: RewardEventType.DELTA_LP,
        address: "Alice",
        value: 10,
        timestamp: 12,
        logIndex: 0,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].stakingWeight).equal(10);
    expect(users["Bob"].stakingWeight).equal(10);
    expect(users["Alice"].earned).closeTo(2.5, 0.00001);
    expect(users["Bob"].earned).closeTo(7.5, 0.00001);
  });

  it("A big price move affects rewards", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpBalance: 10,
        raiLpBalance: 10,
        stakingWeight: 10,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpBalance: 10,
        raiLpBalance: 10,
        stakingWeight: 10,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    const events: RewardEvent[] = [
      // RAI uni reserve falls from 100 to 10
      {
        type: RewardEventType.POOL_SYNC,
        value: 10,
        timestamp: 10,
        logIndex: 0,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].earned).equal(5);
    expect(users["Bob"].earned).equal(5);
    expect(users["Alice"].stakingWeight).equal(5);
    expect(users["Bob"].stakingWeight).equal(5);
  });

  it("Update accumulated rate increases everyone's debt", async () => {
    let users: UserList = {
      Alice: {
        debt: 10,
        lpBalance: 11,
        raiLpBalance: 11,
        stakingWeight: 10,
        rewardPerWeightStored: 0,
        earned: 0,
      },
      Bob: {
        debt: 10,
        lpBalance: 11,
        raiLpBalance: 11,
        stakingWeight: 10,
        rewardPerWeightStored: 0,
        earned: 0,
      },
    };

    const events: RewardEvent[] = [
      {
        type: RewardEventType.UPDATE_ACCUMULATED_RATE,
        value: 0.1,
        timestamp: 10,
        logIndex: 0,
      },
    ];

    users = await processRewardEvent(users, events);
    expect(Object.values(users).length).equal(2);
    expect(users["Alice"].earned).equal(5);
    expect(users["Bob"].earned).equal(5);
    expect(users["Alice"].stakingWeight).equal(11);
    expect(users["Bob"].stakingWeight).equal(11);
    expect(users["Alice"].debt).equal(11);
    expect(users["Bob"].debt).equal(11);
  });
});
