import { fstat } from "node:fs";
import { config } from "./config";
import { subgraphQuery, subgraphQueryPaginated } from "./subgraph";
import { UserList } from "./types";
import { getExclusionList, getOrCreateUser, getSafeOwnerMapping } from "./utils";

const RAI_ADDRESS = "0x03ab458634910aad20ef5f1c8ee96f1d6ac54919".toLowerCase();

export const getInitialState = async (startBlock: number, endBlock: number) => {
  console.log("Fetch initial state...");

  const owners = await getSafeOwnerMapping(endBlock);

  // Get all LP token balance
  const balances = await getInitialRaiLpBalances(startBlock, owners);

  console.log(`  Fetched ${balances.length} LP token balances`);
  // Get all debts
  const debts = await getInitialSafesDebt(startBlock, owners);

  console.log(`  Fetched ${debts.length} debt balances`);

  // Combine debt and LP balances
  const users: UserList = {};
  for (let bal of balances) {
    const user = getOrCreateUser(bal.address, users);
    user.lpBalance = bal.lpBalance;
    user.raiLpBalance = bal.raiLpBalance;
    users[bal.address] = user;
  }

  for (let debt of debts) {
    const user = getOrCreateUser(debt.address, users);
    user.debt += debt.debt;
    users[debt.address] = user;
  }

  // Remove accounts from the exclusion list
  const exclusionList = await getExclusionList();
  for (let e of exclusionList) {
    delete users[e];
  }

  // Set the initial staking weights
  Object.values(users).map((u) => {
    u.stakingWeight = Math.min(u.debt, u.raiLpBalance);
  });

  // Sanity checks
  for (let user of Object.values(users)) {
    if (
      user.debt == undefined ||
      user.earned == undefined ||
      user.lpBalance == undefined ||
      user.raiLpBalance == undefined ||
      user.rewardPerWeightStored == undefined ||
      user.stakingWeight == undefined
    ) {
      throw Error(`Inconsistent initial state user ${user}`);
    }
  }

  console.log(`Finished loading initial state for ${Object.keys(users).length} users`);
  return users;
};

const getInitialSafesDebt = async (startBlock: number, ownerMapping: Map<string, string>) => {
  const debtQuery = `{safes(where: {debt_gt: 0}, first: 1000, skip: [[skip]],block: {number:${startBlock}}) {debt, safeHandler}}`;
  const debtsGraph: {
    debt: number;
    safeHandler: string;
  }[] = await subgraphQueryPaginated(debtQuery, "safes", config().GEB_SUBGRAPH_URL);

  // We need the adjusted debt after accumulated rate for the initial state
  const accumulatedRate = await getAccumulatedRate(startBlock);

  let debts: { address: string; debt: number }[] = [];
  for (let u of debtsGraph) {
    if (!ownerMapping.has(u.safeHandler)) {
      console.log(`Safe handler ${u.safeHandler} has no owner`);
      continue;
    }

    debts.push({
      address: ownerMapping.get(u.safeHandler),
      debt: Number(u.debt) * accumulatedRate,
    });
  }

  return debts;
};

const getInitialRaiLpBalances = async (startBlock: number, ownerMapping: Map<string, string>) => {
  // We need the pool state to convert LP balance to RAI holdings
  const { uniRaiReserve, totalLpSupply } = await getPoolState(startBlock);

  const getRaiFromLpBalance = (lpAmount: number) => (lpAmount * uniRaiReserve) / totalLpSupply;

  // Get the LP token balance at start
  const lpTokenBalancesQuery = `{erc20Balances(where: {tokenAddress: "${
    config().UNISWAP_POOL_ADDRESS
  }", balance_gt: 0}, first: 1000, skip: [[skip]], block: {number: ${startBlock}}), { balance, address }}`;
  const balancesGraph: {
    balance: string;
    address: string;
  }[] = await subgraphQueryPaginated(lpTokenBalancesQuery, "erc20Balances", config().GEB_PERIPHERY_SUBGRAPH_URL);

  const balances = balancesGraph.map((x) => ({
    address: x.address,
    lpBalance: Number(x.balance),
    // RAI LP balance = LP balance * RAI reserve  / total LP supply
    raiLpBalance: getRaiFromLpBalance(Number(x.balance)),
  }));

  // Get the savior LP token balances at start
  const saviorBalanceQuery = `{ saviorBalances(where: {saviorAddress: "${
    config().UNISWAP_SAVIOR_ADDRESS
  }", balance_gt: 0},  first: 1000, skip: [[skip]], block: {number: ${startBlock}}) { address, balance } }`;
  const saviorBalancesGraph: {
    balance: string;
    address: string;
  }[] = await subgraphQueryPaginated(saviorBalanceQuery, "saviorBalances", config().GEB_PERIPHERY_SUBGRAPH_URL);

  // Retrieve real owner of the LP token balance
  const saviorBalances = saviorBalancesGraph.map((x) => {
    if (!ownerMapping.has(x.address)) {
      console.log(`safeHandler without owner ${x.address}`);
    }

    return { address: ownerMapping.get(x.address), balance: Number(x.balance) };
  });

  // Add the savior balance to the LP balances
  for (let saviorBalance of saviorBalances) {
    const i = balances.findIndex((x) => x.address == saviorBalance.address);

    if (i >= 0) {
      balances[i].lpBalance += saviorBalance.balance;
      balances[i].raiLpBalance = getRaiFromLpBalance(balances[i].lpBalance);
    } else {
      balances.push({
        address: saviorBalance.address,
        lpBalance: saviorBalance.balance,
        raiLpBalance: getRaiFromLpBalance(saviorBalance.balance),
      });
    }
  }

  console.log(`  Fetched ${saviorBalancesGraph.length} LP savior token balances`);

  return balances;
};

export const getAccumulatedRate = async (block: number) => {
  return Number(
    (await subgraphQuery(`{collateralType(id: "ETH-A", block: {number: ${block}}) {accumulatedRate}}`, config().GEB_SUBGRAPH_URL)).collateralType
      .accumulatedRate
  );
};

export const getPoolState = async (block: number) => {
  const poolState = await subgraphQuery(
    `{uniswapV2Pairs(block: {number: ${block} }, where: {address: "${config().UNISWAP_POOL_ADDRESS}"}) {reserve0,reserve1,totalSupply,token0,token1}}`,
    config().GEB_PERIPHERY_SUBGRAPH_URL
  );

  let uniRaiReserve: number;

  if (poolState.uniswapV2Pairs[0].token0 === RAI_ADDRESS) {
    uniRaiReserve = Number(poolState.uniswapV2Pairs[0].reserve0);
  } else if (poolState.uniswapV2Pairs[0].token1 === RAI_ADDRESS) {
    uniRaiReserve = Number(poolState.uniswapV2Pairs[0].reserve1);
  } else {
    throw Error("Not a RAI pair");
  }

  const totalLpSupply = Number(poolState.uniswapV2Pairs[0].totalSupply);

  return {
    uniRaiReserve,
    totalLpSupply,
  };
};
