import { config } from "./config";
import { subgraphQuery, subgraphQueryPaginated } from "./subgraph";
import { UserList } from "./types";
import { provider } from "./chain";
import { getOrCreateUser, updateAllStakingWeights } from "./utils";

export const getInitialState = async (startBlock: number) => {
  console.log("Fetch initial state...");

  // Get all LP token balance
  const balances = await getInitialRaiLpBalances(startBlock);

  console.log(`  Fetched ${balances.length} LP token balances`);
  // Get all debts
  const debts = await getInitialSafesDebt(startBlock);

  console.log(`  Fetched ${debts.length} debt balances`);
  const initialTimestamp = (await provider.getBlock(startBlock)).timestamp;

  // Combine debt and LP balances
  const users: UserList = {};
  for (let bal of balances) {
    const user = getOrCreateUser(bal.address, users);
    user.raiLPBalance = bal.balance;
    user.lastUpdated = initialTimestamp;
    users[bal.address] = user;
  }

  for (let debt of debts) {
    const user = getOrCreateUser(debt.address, users);
    user.debt = debt.debt;
    user.lastUpdated = initialTimestamp;
    users[debt.address] = user;
  }

  // Set the initial staking weights
  updateAllStakingWeights(users);

  console.log("Finished loading initial state");
  return users;
};

const getInitialSafesDebt = async (startBlock: number) => {
  const debtQuery = `{safes(where: {debt_gt: 0}, first: 1000, skip: [[skip]],block: {number:${startBlock}}) {debt, owner { address }}}`;
  const debtsGraph: {
    debt: number;
    owner: { address: string };
  }[] = await subgraphQueryPaginated(debtQuery, "safes", config().SUBGRAPH_URL);

  // We need the adjusted debt after accumulated rate for the initial state
  const accumulatedRate = await getAccumulatedRate(startBlock);

  return debtsGraph.map((x) => ({
    address: x.owner.address,
    debt: Number(x.debt) * accumulatedRate,
  }));
};

const getInitialRaiLpBalances = async (startBlock: number) => {
  const lpTokenBalancesQuery = `{erc20Balances(where: {label: "UNISWAP_POOL_TOKEN_COIN", balance_gt: 0}, first: 1000, skip: [[skip]], block: {number: ${startBlock}}), { balance, address }}`;
  const balancesGraph: {
    balance: string;
    address: string;
  }[] = await subgraphQueryPaginated(
    lpTokenBalancesQuery,
    "erc20Balances",
    config().SUBGRAPH_URL
  );

  // We need the pool state to convert LP balance to RAI holdings
  const poolState = await subgraphQuery(
    `{systemState(id: "current", block: {number: ${startBlock} }) {coinUniswapPair{reserve0,totalSupply}}}`,
    config().SUBGRAPH_URL
  );

  const raiRaiReserve = Number(poolState.systemState.coinUniswapPair.reserve0);
  const totalLPSupply = Number(
    poolState.systemState.coinUniswapPair.totalSupply
  );

  // RAI LP balance = LP balance * RAI reserve  / total LP supply
  return balancesGraph.map((x) => ({
    address: x.address,
    balance: (Number(x.balance) * raiRaiReserve) / totalLPSupply,
  }));
};

export const getAccumulatedRate = async (block: number) => {
  return Number(
    (
      await subgraphQuery(
        `{collateralType(id: "ETH-A", block: {number: ${block}}) {accumulatedRate}}`,
        config().SUBGRAPH_URL
      )
    ).collateralType.accumulatedRate
  );
};
