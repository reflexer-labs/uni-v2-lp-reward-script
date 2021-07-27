import { BigQuery } from "@google-cloud/bigquery";

// Get all instadapp accounts that exist
export const getInstadappOwnerMapping = async () => {
  const query = `
DECLARE StartDate DEFAULT TIMESTAMP("2020-03-26 00:00:00+00");
DECLARE BuildTopic DEFAULT "0x83435eca805f6256e4aa778ee8b2e8aec7485fa4b643a0fff05b7df6bf688389";
DECLARE Indexcontract DEFAULT "0x2971adfa57b20e5a416ae5a708a8655a9c74f723";

CREATE TEMP FUNCTION
  PARSE_BUILD(data STRING, topics ARRAY<STRING>)
  RETURNS STRUCT<\`sender\` STRING, \`owner\` STRING, \`account\` STRING, \`address\` STRING>
  LANGUAGE js AS """
    var parsedEvent = {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"account","type":"address"},{"indexed":true,"internalType":"address","name":"origin","type":"address"}],"name":"LogAccountCreated","type":"event"};
    return abi.decodeEvent(parsedEvent, data, topics, false);
"""
OPTIONS
  ( library="https://storage.googleapis.com/ethlab-183014.appspot.com/ethjs-abi.js" );


WITH build_events AS (
  SELECT PARSE_BUILD(data, topics) AS data FROM \`bigquery-public-data.crypto_ethereum.logs\`
    WHERE block_timestamp >= StartDate
      AND address = Indexcontract
      AND topics[offset(0)] = BuildTopic
)

SELECT data.owner AS owner, data.account AS account FROM build_events
    `;

  const res: { owner: string; account: string }[] = await bigQueryJob(query);

  const instaOwners = new Map<string, string>();

  res.map((x) => instaOwners.set(x.account, x.owner));

  return instaOwners;
};

// Generic BQ job
const bigQueryJob = async (query: string) => {
  const bigquery = new BigQuery();
  const options = {
    query: query,
    // location: 'US',
  };

  const [job] = await bigquery.createQueryJob(options);

  // Wait for the query to finish
  const [rows] = await job.getQueryResults();

  return rows;
};
