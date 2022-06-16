import { zeroPad } from "ethers/lib/utils";
import { config } from "./config";
import { subgraphQueryPaginated } from "./subgraph";
import { RewardEvent, RewardEventType } from "./types";
import { getExclusionList } from "./utils";

export const getEvents = async (startBlock: number, endBlock: number, owners: Map<string, string>) => {
  console.log(`Fetch events ...`);
  
  const res = await Promise.all([
    getLpBalanceDelta(startBlock, endBlock, owners),
    getSyncEvents(startBlock, endBlock),
  ]);

  // Merge all events
  let events = res.reduce((a, b) => a.concat(b), []);

  // Filter out events involving the exclusion list
  // Remove accounts from the exclusion list
  const exclusionList = await getExclusionList();
  events = events.filter(
    (e) => !e.address || !exclusionList.includes(e.address)
  );

  // Sort first by timestamp then by logIndex
  events = events.sort((a, b) => {
    if (a.timestamp > b.timestamp) {
      return 1;
    } else if (a.timestamp < b.timestamp) {
      return -1;
    } else {
      if (a.logIndex > b.logIndex) {
        return 1;
      } else {
        return -1;
      }
    }
  });

  console.log(`Fetched a total of ${events.length} events`);

  // Sanity checks
  for (let e of events) {
    if (
      !e ||
      e.logIndex == undefined ||
      !e.timestamp ||
      e.type == undefined ||
      !e.value == undefined
    ) {
      throw Error(`Inconsistent event: ${JSON.stringify(e)}`);
    }

    if (
      e.type === RewardEventType.DELTA_LP
    ) {
      if (!e.address) {
        throw Error(`Inconsistent event: ${JSON.stringify(e)}`);
      }
    } else {
      if (e.address) {
        throw Error(`Inconsistent event: ${JSON.stringify(e)}`);
      }
    }
  }

  return events;
};

const getLpBalanceDelta = async (
  start: number,
  end: number,
  ownerMapping: Map<string, string>
): Promise<RewardEvent[]> => {
  const query = `{
        erc20Transfers(where: {createdAtBlock_gt: ${start}, createdAtBlock_lte: ${end}, tokenAddress: "${
    config().UNISWAP_POOL_ADDRESS
  }"}, first: 1000, skip: [[skip]]) {
          id
          source
          destination
          amount
          createdAt
        }
      }`;

  const data: {
    id: string;
    source: string;
    destination: string;
    amount: string;
    createdAt: string;
  }[] = await subgraphQueryPaginated(
    query,
    "erc20Transfers",
    config().GEB_PERIPHERY_SUBGRAPH_URL
  );

  console.log(`  Fetched ${data.length} LP token transfers`);

  const events: RewardEvent[] = [];

  // Create 2 balance delta events for each transfer (outgoing & incoming)
  for (let event of data) {
    events.push({
      type: RewardEventType.DELTA_LP,
      value: -1 * Number(event.amount),
      address: event.source,
      logIndex: getLogIndexFromId(event.id),
      timestamp: Number(event.createdAt),
    });

    events.push({
      type: RewardEventType.DELTA_LP,
      value: Number(event.amount),
      address: event.destination,
      logIndex: getLogIndexFromId(event.id),
      timestamp: Number(event.createdAt),
    });
  }

  const saviorBalanceQuery = `{ saviorBalanceChanges(where: {createdAtBlock_gt: ${start}, createdAtBlock_lte: ${end}, saviorAddress: "${
    config().UNISWAP_SAVIOR_ADDRESS
  }"},  first: 1000, skip: [[skip]]) { id, address, deltaBalance, createdAt } }`;
  const saviorBalancesGraph: {
    id: string;
    deltaBalance: string;
    address: string;
    createdAt: string;
  }[] = await subgraphQueryPaginated(saviorBalanceQuery, "saviorBalanceChanges", config().GEB_PERIPHERY_SUBGRAPH_URL);
  
  for(let event of saviorBalancesGraph) {
    if(!ownerMapping.has(event.address)) {
      console.log(`Safe handler ${event.address} has no owner`);
    }

    events.push({
      type: RewardEventType.DELTA_LP,
      value: Number(event.deltaBalance),
      address: ownerMapping.get(event.address),
      logIndex: getLogIndexFromId(event.id),
      timestamp: Number(event.createdAt)
    })
  }

  console.log(`  Fetched ${saviorBalancesGraph.length} savior LP token transfers`);

  return events;
};

const getSyncEvents = async (
  start: number,
  end: number
): Promise<RewardEvent[]> => {
  const query = `{
    uniswapV2Syncs(where: {createdAtBlock_gt: ${start}, createdAtBlock_lte: ${end}, pair: "${
    config().UNISWAP_POOL_ADDRESS
  }"}, first: 1000, skip: [[skip]]) {
                id
                reserve0
                createdAt
            }
        }`;

  const data: {
    id: string;
    reserve0: string;
    createdAt: string;
  }[] = await subgraphQueryPaginated(
    query,
    "uniswapV2Syncs",
    config().GEB_PERIPHERY_SUBGRAPH_URL
  );

  const events = data.map((x) => ({
    type: RewardEventType.POOL_SYNC,
    value: Number(x.reserve0),
    logIndex: getLogIndexFromId(x.id),
    timestamp: Number(x.createdAt),
  }));
  console.log(`  Fetched ${events.length} Uniswap syncs events`);
  return events;
};

const getLogIndexFromId = (id: string) => {
  const matches = id.split("-");

  if (matches.length < 2 || isNaN(Number(matches[1]))) {
    throw Error("Invalid log index");
  }

  return Number(matches[1]);
};
