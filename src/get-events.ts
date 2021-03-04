import { zeroPad } from "ethers/lib/utils";
import { config } from "./config";
import { subgraphQueryPaginated } from "./subgraph";
import { RewardEvent, RewardEventType } from "./types";
import { NULL_ADDRESS } from "./utils";

export const getEvents = async (startBlock: number, endBlock: number) => {
  console.log(`Fetch events ...`);
  const res = await Promise.all([
    getSafeModificationEvents(startBlock, endBlock),
    getLpBalanceDelta(startBlock, endBlock),
    getSyncEvents(startBlock, endBlock),
    getUpdateAccumulatedRateEvent(startBlock, endBlock),
  ]);
  console.log(`Fetched all events`);

  let events = res.reduce((a, b) => a.concat(b), []);

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

  console.log(events);
  return events;
};

const getSafeModificationEvents = async (
  start: number,
  end: number
): Promise<RewardEvent[]> => {
  const query = `{
      modifySAFECollateralizations(where: {createdAtBlock_gte: ${start}, createdAtBlock_lte: ${end}, deltaDebt_not: 0}, first: 1000, skip: [[skip]]) {
        id
        deltaDebt
        safe {
          owner {
            address
          }
        }
        createdAt
      }
    }`;

  const data: {
    id: string;
    detaDebt: string;
    createdAt: string;
    safe: { owner: { address: string } };
  }[] = await subgraphQueryPaginated(
    query,
    "modifySAFECollateralizations",
    config().SUBGRAPH_URL
  );

  const events = data.map((x: any) => ({
    type: RewardEventType.DELTA_DEBT,
    value: Number(x.deltaDebt),
    address: x.safe.owner.address,
    logIndex: getLogIndexFromId(x.id),
    timestamp: Number(x.createdAt),
  }));

  console.log(`  Fetched ${events.length} safe modifications events`);
  return events;
};

const getLpBalanceDelta = async (
  start: number,
  end: number
): Promise<RewardEvent[]> => {
  const query = `{
        erc20Transfers(where: {createdAtBlock_gte: ${start}, createdAtBlock_lte: ${end}, label: "UNISWAP_POOL_TOKEN_COIN"}, first: 1000, skip: [[skip]]) {
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
    config().SUBGRAPH_URL
  );

  console.log(`  Fetched ${data.length} LP token transfers`);

  const events: RewardEvent[] = [];

  // Create 2 balance delta events for each transfer (outgoing & incoming)
  for (let event of data) {
    if (event.source !== NULL_ADDRESS) {
      events.push({
        type: RewardEventType.DELTA_LP,
        value: -1 * Number(event.amount),
        address: event.source,
        logIndex: getLogIndexFromId(event.id),
        timestamp: Number(event.createdAt),
      });
    }

    if (event.destination !== NULL_ADDRESS) {
      events.push({
        type: RewardEventType.DELTA_LP,
        value: Number(event.amount),
        address: event.destination,
        logIndex: getLogIndexFromId(event.id),
        timestamp: Number(event.createdAt),
      });
    }
  }

  // Sanity check
  events.map((x) => {
    if (!x || !x.address || x.address === "") {
      throw Error(`Incorrect Delta LP event ${x}`);
    }
  });

  return events;
};

const getSyncEvents = async (
  start: number,
  end: number
): Promise<RewardEvent[]> => {
  const query = `{
            uniswapSyncs(where: {createdAtBlock_gte: ${start}, createdAtBlock_lte: ${end}}, first: 1000, skip: [[skip]]) {
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
    "uniswapSyncs",
    config().SUBGRAPH_URL
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

const getUpdateAccumulatedRateEvent = async (
  start: number,
  end: number
): Promise<RewardEvent[]> => {
  const query = `{
            updateAccumulatedRates(orderBy: accumulatedRate, orderDirection: desc where: {createdAtBlock_gte: ${start}, createdAtBlock_lte: ${end}}, first: 1000, skip: [[skip]]) {
              id
              rateMultiplier
              createdAt
            }
        }`;

  const data: {
    id: string;
    rateMultiplier: string;
    createdAt: string;
  }[] = await subgraphQueryPaginated(
    query,
    "updateAccumulatedRates",
    config().SUBGRAPH_URL
  );

  const events = data.map((x) => ({
    type: RewardEventType.UPDATE_ACCUMULATED_RATE,
    value: Number(x.rateMultiplier) + 1,
    logIndex: getLogIndexFromId(x.id),
    timestamp: Number(x.createdAt),
  }));
  console.log(`  Fetched ${events.length} accumulated rate events`);
  return events;
};

const getLogIndexFromId = (id: string) => {
  const matches = id.split("-");

  if (matches.length < 2 || isNaN(Number(matches[1]))) {
    throw Error("Invalid log index");
  }

  return Number(matches[1]);
};
