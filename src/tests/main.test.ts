import { expect } from "chai";
import { type } from "node:os";
import { ImportMock } from "ts-mock-imports";

import { processRewardEvent } from "../rewards";
import { RewardEvent, RewardEventType, UserList } from "../types";
import * as Config from "../config";
import * as InitialState from "../initial-state";
import * as Chain from "../chain";

describe("processRewardEvent", async () => {
  ImportMock.mockFunction(Config, "config", {
    SUBGRAPH_URL: "",
    RPC_URL: "",
    START_BLOCK: 5,
    END_BLOCK: 15,
    REWARD_AMOUNT: 10,
  });

  ImportMock.mockOther(InitialState, "getAccumulatedRate", async (b) => 1);
  ImportMock.mockOther(InitialState, "getPoolState", async (b) => ({
    uniRaiReserve: 100,
    totalLpSupply: 15,
  }));

  ImportMock.mockOther(Chain, "provider", {
    // @ts-ignore
    getBlock: async (b) => ({
      timestamp: b,
    }),
  });

  it("Add debt, remove debt add back debt with high prior LP", async () => {
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
    expect(users["Alice"].earned).equal(5);
    expect(users["Alice"].stakingWeight).equal(10);
    expect(users["Bob"].earned).equal(0);
  });
});
